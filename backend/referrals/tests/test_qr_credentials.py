import json
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Barrier
from time import monotonic, sleep
from unittest.mock import patch

import pytest
from django.conf import settings
from django.core import signing
from django.db import DatabaseError, close_old_connections, connections, transaction
from drf_spectacular.generators import SchemaGenerator
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.test import APIClient

from accounts.models import User
from credits.models import Consumption, ProviderConsumptionCredential, Wallet, WalletEntry
from credits.services import award_consumption, set_provider_pin, sign_provider_qr
from providers.models import Benefit, FolderBenefit, Provider, Publication
from referrals.access import active_folder_access, parse_qr, redeem_qr, sign_qr
from referrals.credentials import credential_version, renew_own_qr
from referrals.models import CollaboratorProfile, FolderAccess, QRRenewalReceipt
from referrals.tests.test_referrals import authorized


@pytest.fixture
def owner():
    user = User.objects.create_user("qr-owner@example.test", "Secret-123", role="COLLABORATOR")
    return CollaboratorProfile.objects.create(user=user, enabled=True)


@pytest.mark.django_db
def test_qr_is_deterministic_without_timestamp(owner):
    with patch("django.core.signing.time.time", return_value=1700000000):
        first = sign_qr(owner)
    with patch("django.core.signing.time.time", return_value=1800000000):
        second = sign_qr(owner)
    assert first == second
    assert first.startswith("r2.")
    assert parse_qr(first) == (str(owner.pk), 1)


@pytest.mark.django_db
def test_get_qr_exposes_opaque_precondition(owner):
    response = authorized(owner.user).get("/api/v1/collaborator/qr/")
    assert response.status_code == 200
    assert len(response.data["version"]) == 64
    assert response.data["version"] != str(owner.qr_version)
    owner.refresh_from_db()
    assert owner.qr_version == 1


@pytest.mark.django_db
def test_renewal_endpoint_requires_idempotency_key(owner):
    response = authorized(owner.user).post("/api/v1/collaborator/qr/renew/", {"version": "a" * 64}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_legacy_qr_stays_valid(owner):
    token = signing.dumps({"id": str(owner.pk), "v": 1}, key=settings.QR_SIGNING_KEY,
                          salt="llave-extra.collaborator-referral.v1", compress=False)
    assert parse_qr(token) == (str(owner.pk), 1)


def renew(client, version, key="renew-once", **extra):
    return client.post("/api/v1/collaborator/qr/renew/", {"version": version, **extra},
                       format="json", HTTP_IDEMPOTENCY_KEY=key)


@pytest.mark.django_db
def test_get_png_and_selection_edits_keep_exact_url_image_and_precondition(owner):
    client = authorized(owner.user)
    original = client.get("/api/v1/collaborator/qr/").data
    first_png = client.get("/api/v1/collaborator/qr.png")
    admin_client = authorized(User.objects.create_superuser("qr-admin@example.test", "Secret-123"))
    admin_root = f"/api/v1/admin/collaborators/{owner.pk}/"
    assert admin_client.get(admin_root + "qr/").data["url"] == original["url"]
    assert admin_client.get(admin_root + "qr.png").content == first_png.content
    provider = Provider.objects.create(slug="stable", name="Estable", status=Publication.PUBLISHED)
    benefit = Benefit.objects.create(provider=provider, title="Oferta", conditions="Reserva", status=Publication.PUBLISHED)
    with patch("django.core.signing.TimestampSigner.timestamp", return_value="a-later-time"):
        assert client.put(f"/api/v1/collaborator/recommendations/{benefit.pk}/", {}, format="json").status_code == 201
        assert client.get("/api/v1/collaborator/qr/").data == original
        second_png = client.get("/api/v1/collaborator/qr.png")
        assert second_png.content == first_png.content
        assert admin_client.get(admin_root + "qr/").data["url"] == original["url"]
        assert admin_client.get(admin_root + "qr.png").content == first_png.content
        assert client.delete(f"/api/v1/collaborator/recommendations/{benefit.pk}/").status_code == 204
        assert client.get("/api/v1/collaborator/qr/").data == original
    owner.refresh_from_db()
    assert owner.qr_version == 1
    assert QRRenewalReceipt.objects.count() == 0
    assert first_png["Cache-Control"] == "no-store"
    assert first_png["Referrer-Policy"] == "no-referrer"


@pytest.mark.django_db
@pytest.mark.parametrize("payload", [None, [], "id", 12, {"id": 12, "v": 1}, {"id": "bad", "v": 1},
                                    {"id": "00000000-0000-0000-0000-000000000000", "v": True},
                                    {"id": "00000000000000000000000000000000", "v": 1},
                                    {"id": "00000000-0000-0000-0000-000000000000", "v": 0},
                                    {"id": "00000000-0000-0000-0000-000000000000", "v": "1"},
                                    {"id": "00000000-0000-0000-0000-000000000000", "v": 1, "extra": 2}])
@pytest.mark.parametrize("legacy", [False, True])
def test_parser_rejects_signed_malformed_payloads_without_500(payload, legacy):
    if legacy:
        token = signing.dumps(payload, key=settings.QR_SIGNING_KEY, salt="llave-extra.collaborator-referral.v1")
    else:
        token = "r2." + signing.Signer(key=settings.QR_SIGNING_KEY, salt="llave-extra.collaborator-referral.v2").sign_object(payload)
    with pytest.raises(ValidationError):
        parse_qr(token)


@pytest.mark.django_db
def test_parser_formats_salts_and_corrupt_encodings_are_separate(owner):
    legacy = signing.dumps({"id": str(owner.pk), "v": 1}, key=settings.QR_SIGNING_KEY,
                           salt="llave-extra.collaborator-referral.v1")
    signer = signing.Signer(key=settings.QR_SIGNING_KEY, salt="llave-extra.collaborator-referral.v2")
    other = signing.Signer(key=settings.QR_SIGNING_KEY, salt="llave-extra.provider-consumption.v1")
    provider = Provider.objects.create(slug="wrong-qr-kind", name="Otro QR")
    provider_token = sign_provider_qr(ProviderConsumptionCredential.objects.create(provider=provider))
    tokens = [None, 123, "", sign_qr(owner) + "x", "r2." + legacy, sign_qr(owner)[3:],
              "r2." + other.sign_object({"id": str(owner.pk), "v": 1}),
              "r2." + signer.sign("?"), "r2." + signer.sign(".bm90LWNvbXByZXNzZWQ"),
              "r2." + signer.sign("_w"), provider_token]
    for token in tokens:
        with pytest.raises(ValidationError):
            parse_qr(token)


@pytest.mark.django_db
def test_renew_once_replay_conflict_and_authoritative_get(owner):
    client = authorized(owner.user)
    original = client.get("/api/v1/collaborator/qr/").data
    first = renew(client, original["version"])
    assert first.status_code == 200
    assert first.data == {"id": str(owner.pk), "status": "renewed", "version": first.data["version"]}
    assert first["Cache-Control"] == "no-store" and first["Referrer-Policy"] == "no-referrer"
    current = client.get("/api/v1/collaborator/qr/").data
    assert current["url"] != original["url"] and current["version"] == first.data["version"]
    assert renew(client, original["version"]).data == first.data
    assert renew(client, current["version"]).status_code == 409
    assert renew(client, original["version"], "another-key").status_code == 409
    second = renew(client, current["version"], "second-renewal")
    assert second.status_code == 200
    assert renew(client, original["version"]).data == first.data  # Original result, even after another renewal.
    owner.refresh_from_db()
    assert owner.qr_version == 3 and QRRenewalReceipt.objects.count() == 2
    receipt = QRRenewalReceipt.objects.order_by("pk").first()
    assert (receipt.previous_version, receipt.renewed_version) == (1, 2)
    assert receipt.actor_id == owner.user_id and receipt.profile_id == owner.pk
    persisted = json.dumps(list(QRRenewalReceipt.objects.values()), default=str)
    assert original["url"] not in persisted and current["url"] not in persisted
    assert "r2." not in persisted and "/referencia" not in persisted


@pytest.mark.django_db
def test_renew_revokes_legacy_new_and_grants_preserving_consumption_history(owner):
    tourist = User.objects.create_user("history@example.test", "Secret-123", email_verified=True)
    legacy = signing.dumps({"id": str(owner.pk), "v": 1}, key=settings.QR_SIGNING_KEY,
                           salt="llave-extra.collaborator-referral.v1")
    modern = sign_qr(owner)
    redeem_qr(tourist, legacy)
    redeem_qr(tourist, modern)
    provider = Provider.objects.create(slug="history", name="Historia", status=Publication.PUBLISHED)
    benefit = Benefit.objects.create(provider=provider, title="Oferta", conditions="Reserva", status=Publication.PUBLISHED)
    FolderBenefit.assign(owner.pk, benefit.pk)
    set_provider_pin(provider.pk, "123456")
    provider_token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=provider))
    result = award_consumption(tourist, owner.pk, provider_token, "123456", "visit-history")
    before = list(Consumption.objects.values())
    wallet_before = Wallet.objects.get(tourist=tourist).balance
    renew_own_qr(owner.user, "history-renew", credential_version(owner))
    assert not active_folder_access(tourist, owner)
    for token in (modern, legacy):
        with pytest.raises(ValidationError):
            redeem_qr(tourist, token)
    assert FolderAccess.objects.count() == 1
    assert list(Consumption.objects.values()) == before
    assert Wallet.objects.get(tourist=tourist).balance == wallet_before
    assert WalletEntry.objects.count() == 1
    assert FolderBenefit.objects.filter(collaborator=owner, benefit=benefit).exists()
    assert award_consumption(tourist, owner.pk, provider_token, "123456", "visit-history") == result
    owner.refresh_from_db()
    assert redeem_qr(tourist, sign_qr(owner)).qr_version == 2
    assert FolderAccess.objects.count() == 2


@pytest.mark.django_db
@pytest.mark.parametrize("change", ["disabled", "inactive", "role"])
def test_permissions_current_even_for_replay_and_stale_user(owner, change):
    version = credential_version(owner)
    renew_own_qr(owner.user, "replay", version)
    if change == "disabled":
        CollaboratorProfile.objects.filter(pk=owner.pk).update(enabled=False)
    elif change == "inactive":
        User.objects.filter(pk=owner.user_id).update(is_active=False)
    else:
        User.objects.filter(pk=owner.user_id).update(role="PROVIDER")
    for key in ("replay", "new-command"):
        with pytest.raises(PermissionDenied):
            renew_own_qr(owner.user, key, version)
    client = APIClient()
    client.force_authenticate(owner.user)  # Simulate a request object loaded before the change.
    assert client.get("/api/v1/collaborator/qr/").status_code == 403
    assert client.get("/api/v1/collaborator/qr.png").status_code == 403
    owner.refresh_from_db()
    assert owner.qr_version == 2 and QRRenewalReceipt.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["TOURIST", "PROVIDER", "ADMIN"])
def test_wrong_roles_cannot_renew_own_or_other_profile(owner, role):
    user = User.objects.create_user(f"{role.lower()}@example.test", "Secret-123", role=role)
    client = authorized(user)
    assert renew(client, credential_version(owner)).status_code == 403
    assert QRRenewalReceipt.objects.count() == 0


@pytest.mark.django_db
def test_own_profile_is_server_selected_and_body_key_validation(owner):
    other_user = User.objects.create_user("other-collab@example.test", "Secret-123", role="COLLABORATOR")
    other = CollaboratorProfile.objects.create(user=other_user, enabled=True)
    client = authorized(other_user)
    assert renew(client, credential_version(owner)).status_code == 409
    assert renew(client, credential_version(other), profile_id=str(owner.pk)).status_code == 400
    assert renew(client, credential_version(other), user_id=str(owner.user_id)).status_code == 400
    assert renew(client, credential_version(other), key=" ").status_code == 400
    assert renew(client, credential_version(other), key="x" * 129).status_code == 400
    assert renew(client, "invalid").status_code == 400
    assert client.post("/api/v1/collaborator/qr/renew/", {}, format="json", HTTP_IDEMPOTENCY_KEY="empty").status_code == 400
    assert APIClient().post("/api/v1/collaborator/qr/renew/", {"version": credential_version(owner)}, format="json").status_code == 401
    assert renew(client, credential_version(other)).status_code == 200
    owner.refresh_from_db()
    other.refresh_from_db()
    assert owner.qr_version == 1 and other.qr_version == 2
    # Keys are scoped to the actor, without access to another actor's receipt.
    assert renew(authorized(owner.user), credential_version(owner)).status_code == 200
    assert QRRenewalReceipt.objects.filter(key="renew-once").count() == 2


@pytest.mark.django_db
def test_collaborator_without_profile_cannot_renew(owner):
    user = User.objects.create_user("no-profile@example.test", "Secret-123", role="COLLABORATOR")
    assert renew(authorized(user), credential_version(owner)).status_code == 403
    assert QRRenewalReceipt.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize("body", [None, [], "version", {"version": None}, {"version": 1},
                                 {"version": " " + "a" * 64}, {"version": "a" * 64 + "\n"}])
def test_body_invalid_shapes_and_version_types_are_400(owner, body):
    response = authorized(owner.user).post("/api/v1/collaborator/qr/renew/", body, format="json", HTTP_IDEMPOTENCY_KEY="bad-body")
    assert response.status_code == 400
    owner.refresh_from_db()
    assert owner.qr_version == 1 and QRRenewalReceipt.objects.count() == 0


@pytest.mark.django_db
def test_failed_receipt_rolls_back_rotation(owner):
    with patch("referrals.credentials.QRRenewalReceipt.objects.create", side_effect=RuntimeError("Audit failure")):
        with pytest.raises(RuntimeError):
            renew_own_qr(owner.user, "rollback", credential_version(owner))
    owner.refresh_from_db()
    assert owner.qr_version == 1 and QRRenewalReceipt.objects.count() == 0


def test_openapi_own_renewal_contract():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    operation = schema["paths"]["/api/v1/collaborator/qr/renew/"]["post"]
    assert any(parameter["name"] == "Idempotency-Key" and parameter["required"] for parameter in operation["parameters"])
    assert schema["components"]["schemas"]["QRRenewal"]["required"] == ["version"]
    assert set(schema["components"]["schemas"]["QRRenewalResponse"]["properties"]) == {"id", "status", "version"}


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("same_key", [True, False])
def test_real_postgres_concurrent_renewal_has_one_transition_and_receipt(owner, same_key):
    assert connections["default"].vendor == "postgresql"
    barrier = Barrier(2)
    version = credential_version(owner)

    def run(key):
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SET lock_timeout = '8s'")
                cursor.execute("SET statement_timeout = '15s'")
            barrier.wait(timeout=10)
            try:
                return renew_own_qr(owner.user, key, version)
            except APIException as exc:
                return exc.status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, key) for key in ("first", "first" if same_key else "second")]
        results = [future.result(timeout=25) for future in futures]
    successes = [result for result in results if isinstance(result, dict)]
    assert len(successes) == (2 if same_key else 1)
    if same_key:
        assert results[0] == results[1]
    else:
        assert 409 in results
    owner.refresh_from_db()
    assert owner.qr_version == 2 and QRRenewalReceipt.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_renew_holds_user_before_profile_and_rechecks_enabled_after_wait(owner):
    worker_pid = Queue()
    version = credential_version(owner)

    def blocked_renewal():
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            try:
                return renew_own_qr(owner.user, "blocked", version)
            except APIException as exc:
                return exc.status_code
        finally:
            connections.close_all()

    def user_lock_available():
        close_old_connections()
        try:
            with transaction.atomic():
                User.objects.select_for_update(nowait=True).get(pk=owner.user_id)
            return True
        except DatabaseError:
            return False
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        with transaction.atomic():
            CollaboratorProfile.objects.select_for_update().get(pk=owner.pk)
            future = pool.submit(blocked_renewal)
            pid = worker_pid.get(timeout=5)
            # Wait for the actual PG profile lock wait, not a scheduling delay.
            deadline = monotonic() + 5
            while True:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SELECT cardinality(pg_blocking_pids(%s))", [pid])
                    if cursor.fetchone()[0]:
                        break
                assert monotonic() < deadline
                sleep(0.02)
            assert pool.submit(user_lock_available).result(timeout=5) is False
            CollaboratorProfile.objects.filter(pk=owner.pk).update(enabled=False)
        assert future.result(timeout=10) == 403
    owner.refresh_from_db()
    assert owner.qr_version == 1 and QRRenewalReceipt.objects.count() == 0
