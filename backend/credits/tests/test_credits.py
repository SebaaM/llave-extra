import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from queue import Queue
from threading import Event
from time import monotonic, sleep

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.management import call_command
from django.db import DatabaseError, IntegrityError, close_old_connections, connections, transaction
from django.db.models import Sum
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from credits.admin import AdjustmentAdmin, ConsumptionAdmin
from credits.models import (
    AdjustmentCase,
    Consumption,
    ConsumptionIdempotency,
    CreditPolicy,
    ProviderConsumptionCredential,
    ProviderCreditRule,
    Wallet,
    WalletEntry,
)
from credits.services import (
    Conflict,
    annul_consumption,
    award_consumption,
    credit_wallet,
    debit_wallet,
    refund_wallet,
    resolve_adjustment,
    rotate_provider_qr,
    set_provider_pin,
    sign_provider_qr,
)
from providers.models import (
    Benefit,
    CatalogConfig,
    FolderProvider,
    Provider,
    ProviderMembership,
    Publication,
)
from referrals.models import CollaboratorProfile, FolderAccess


def authorized(user):
    token, _ = issue_session(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def domain():
    tourist = User.objects.create_user("client@example.test", "Secret-123", email_verified=True)
    second = User.objects.create_user("second@example.test", "Secret-123", email_verified=True)
    admin = User.objects.create_superuser("admin@example.test", "Secret-123")
    collaborator = User.objects.create_user("collab@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    provider = Provider.objects.create(slug="benefit-one", name="One", status=Publication.PUBLISHED)
    other = Provider.objects.create(slug="benefit-two", name="Two", status=Publication.PUBLISHED)
    for item in (provider, other):
        Benefit.objects.create(provider=item, title="Oferta vigente", conditions="Con reserva",
                               status=Publication.PUBLISHED)
    FolderProvider.assign(profile.pk, provider.pk)
    FolderProvider.assign(profile.pk, other.pk)
    for person in (tourist, second):
        FolderAccess.objects.create(tourist=person, collaborator=profile, qr_version=profile.qr_version)
    set_provider_pin(provider.pk, "123456")
    set_provider_pin(other.pk, "654321")
    token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=provider))
    other_token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=other))
    return tourist, second, admin, profile, provider, other, token, other_token


def post(client, profile, token, pin="123456", key="visit-1"):
    return client.post("/api/v1/consumptions/", {"folder_id": str(profile.pk), "qr_token": token, "pin": pin},
                       format="json", HTTP_IDEMPOTENCY_KEY=key)


def post_direct(client, token, pin="123456", key="visit-1", *, explicit_null=False):
    payload = {"qr_token": token, "pin": pin}
    if explicit_null:
        payload["folder_id"] = None
    return client.post("/api/v1/consumptions/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)


@pytest.mark.django_db
def test_direct_omitted_and_null_are_same_request_without_attribution(domain):
    tourist, _, _, profile, provider, _, token, _ = domain
    client = authorized(tourist)
    first = post_direct(client, token)
    assert first.status_code == 201 and first.data["collaborator_id"] is None
    assert post_direct(client, token, explicit_null=True).data == first.data
    assert post(client, profile, token).status_code == 409
    assert Consumption.objects.get(provider=provider).collaborator_id is None
    assert client.get("/api/v1/me/consumptions/").data[0]["collaborator_id"] is None
    assert Wallet.objects.get(tourist=tourist).balance == 1000
    assert WalletEntry.objects.filter(kind=WalletEntry.Kind.EARN).count() == 1


@pytest.mark.django_db
def test_referred_key_cannot_replay_as_direct_and_invalid_reference_cannot_fallback(domain):
    tourist, _, _, profile, provider, _, token, _ = domain
    client = authorized(tourist)
    assert post(client, profile, token).status_code == 201
    assert post_direct(client, token).status_code == 409
    assert Consumption.objects.get(provider=provider).collaborator_id == profile.pk
    second_client = authorized(User.objects.create_user("third@example.test", "Secret-123", email_verified=True))
    assert post(second_client, profile, token).status_code == 403
    assert Consumption.objects.count() == 1
    assert post_direct(second_client, token).status_code == 201
    assert Consumption.objects.filter(collaborator__isnull=True).count() == 1


@pytest.mark.django_db
def test_referred_consumption_also_requires_current_benefit(domain):
    tourist, _, _, profile, provider, _, token, _ = domain
    Benefit.objects.filter(provider=provider).update(status=Publication.DRAFT)
    assert post(authorized(tourist), profile, token).status_code == 403
    assert Consumption.objects.count() == 0


@pytest.mark.django_db
@override_settings(RATE_LIMITS={"consumption": (100, 300)})
def test_direct_requires_valid_customer_qr_pin_provider_and_current_benefit(domain):
    tourist, second, _, _, provider, other, token, other_token = domain
    client = authorized(tourist)
    assert post_direct(client, token + "x").status_code == 400
    assert post_direct(client, token, pin="000000").status_code == 400
    tourist.email_verified = False
    tourist.save(update_fields=["email_verified"])
    assert post_direct(client, token).status_code == 403
    tourist.email_verified = True
    tourist.save(update_fields=["email_verified"])
    assert post_direct(authorized(User.objects.create_user("provider-role@example.test", "Secret-123",
                                                        role=User.Role.PROVIDER, email_verified=True)), token).status_code == 403
    Benefit.objects.filter(provider=provider).update(status=Publication.DRAFT)
    assert post_direct(client, token).status_code == 403
    benefit = Benefit.objects.get(provider=provider)
    benefit.status = Publication.PUBLISHED
    benefit.valid_from = timezone.localdate() + timedelta(days=1)
    benefit.save()
    assert post_direct(client, token).status_code == 403
    benefit.valid_from = None
    benefit.valid_until = timezone.localdate() - timedelta(days=1)
    benefit.save()
    assert post_direct(client, token).status_code == 403
    benefit.valid_until = timezone.localdate()
    benefit.save()
    provider.status = Publication.INACTIVE
    provider.save()
    assert post_direct(client, token).status_code == 403
    provider.status = Publication.PUBLISHED
    provider.save()
    rotate_provider_qr(provider.pk)
    assert post_direct(client, token).status_code == 400
    current = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=provider))
    CatalogConfig.objects.update_or_create(singleton=1, defaults={"enabled": False})
    assert post_direct(client, current).status_code == 201
    assert post_direct(authorized(second), other_token, pin="654321", key="other").status_code == 201


@pytest.mark.django_db
def test_direct_consumption_attribution_is_immutable_from_null(domain):
    tourist, _, _, profile, _, _, token, _ = domain
    item = award_consumption(tourist, None, token, "123456", "direct-null")[0]
    with pytest.raises(DatabaseError), transaction.atomic(), connections["default"].cursor() as cursor:
        cursor.execute("UPDATE credits_consumption SET collaborator_id = %s WHERE id = %s",
                       [profile.pk, item["id"]])
    assert Consumption.objects.get(pk=item["id"]).collaborator_id is None


@pytest.mark.django_db(transaction=True)
def test_direct_and_referred_race_awards_once(domain):
    tourist, _, _, profile, provider, _, token, _ = domain

    def earn(folder_id, key):
        close_old_connections()
        try:
            return award_consumption(tourist, folder_id, token, "123456", key)[1]
        except Conflict:
            return 409
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda args: earn(*args), ((None, "direct"), (profile.pk, "referred"))))
    assert sorted(results) == [201, 409]
    item = Consumption.objects.get(tourist=tourist, provider=provider)
    assert item.collaborator_id in (None, profile.pk)
    assert Consumption.objects.count() == ConsumptionIdempotency.objects.count() == 1
    assert WalletEntry.objects.filter(reference=f"consumption:{item.pk}:earn").count() == 1
    assert Wallet.objects.get(tourist=tourist).balance == item.award == 1000


@pytest.mark.django_db
def test_award_idempotency_snapshot_and_lifetime_uniqueness(domain):
    tourist, _, _, profile, provider, other, token, other_token = domain
    client = authorized(tourist)
    first = post(client, profile, token)
    assert first.status_code == 201 and first.data["award"] == 1000
    assert first["Cache-Control"] == "no-store"
    assert post(client, profile, token).data == first.data
    assert post(client, profile, token, pin="999999").status_code == 409
    assert post(client, profile, token + "x").status_code == 409
    assert post(client, profile, token, key="visit-2").status_code == 409
    assert Consumption.objects.count() == 1 and ConsumptionIdempotency.objects.count() == 1
    policy = CreditPolicy.objects.get()
    policy.base_reward = 2000
    policy.target_visits = 1
    policy.save()
    ProviderCreditRule.objects.create(provider=other, reward=0)
    second = post(client, profile, other_token, pin="654321", key="other")
    assert second.status_code == 201 and second.data["award"] == 0
    assert Wallet.objects.get(tourist=tourist).balance == 1000
    assert WalletEntry.objects.count() == 1
    assert Consumption.objects.get(provider=provider).rule_snapshot["amount"] == 1000
    assert Consumption.objects.get(provider=other).rule_snapshot["source"] == "provider"
    assert client.get("/api/v1/me/progress/").data == {"total": 2, "target": 1, "completed": True}
    with pytest.raises(IntegrityError), transaction.atomic():
        Consumption.objects.create(tourist=tourist, provider=provider, collaborator=profile,
                                   award=1, rule_snapshot={})


@pytest.mark.django_db
@override_settings(RATE_LIMITS={"consumption": (2, 300)})
def test_changed_body_with_confirmed_key_consumes_quota_but_identical_retry_does_not(domain):
    tourist, _, _, profile, provider, _, token, _ = domain
    client = authorized(tourist)
    original = post(client, profile, token)
    assert original.status_code == 201
    assert post(client, profile, token, pin="111111").status_code == 409
    assert post(client, profile, token, pin="222222").status_code == 429
    rotate_provider_qr(provider.pk)
    set_provider_pin(provider.pk, "333333")
    retry = post(client, profile, token)
    assert retry.status_code == 201 and retry.data == original.data


@pytest.mark.django_db
def test_annul_transition_cannot_change_consumption_uuid(domain):
    tourist, _, admin, profile, _, _, token, _ = domain
    item = award_consumption(tourist, profile.pk, token, "123456", "identity")[0]
    old_id = item["id"]
    with pytest.raises(DatabaseError), transaction.atomic(), connections["default"].cursor() as cursor:
        cursor.execute(
            "UPDATE credits_consumption SET id = %s, state = 'ANNULLED', "
            "annulled_at = %s, annulled_by_id = %s, annul_reason = %s WHERE id = %s",
            [str(uuid.uuid4()), timezone.now(), admin.pk, "Cambio inválido", old_id],
        )
    assert Consumption.objects.get(pk=old_id).state == Consumption.State.VALID
    assert WalletEntry.objects.get(reference=f"consumption:{old_id}:earn").delta == 1000


@pytest.mark.django_db
@override_settings(RATE_LIMITS={"consumption": (100, 300)})
def test_invalid_private_eligibility_and_rotation(domain):
    tourist, second, _, profile, provider, other, token, other_token = domain
    client = authorized(tourist)
    assert APIClient().post("/api/v1/consumptions/").status_code == 401
    assert post(client, profile, token + "x").status_code == 400
    assert post(client, profile, token, pin="000000").status_code == 400
    outsider = User.objects.create_user("outsider@example.test", "Secret-123", email_verified=True)
    assert post(authorized(outsider), profile, token).status_code == 403
    tourist.email_verified = False
    tourist.save(update_fields=["email_verified"])
    assert post(client, profile, token).status_code == 403
    tourist.email_verified = True
    tourist.save(update_fields=["email_verified"])
    rotate_provider_qr(provider.pk)
    assert post(client, profile, token).status_code == 400
    current = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=provider))
    assert post(client, profile, current).status_code == 201
    # Retry confirmed result survives subsequent revocation, QR and PIN rotation.
    CollaboratorProfile.rotate(profile.pk)
    set_provider_pin(provider.pk, "888888")
    rotate_provider_qr(provider.pk)
    assert post(client, profile, current).status_code == 201
    assert post(authorized(second), profile, current, key="second").status_code == 403
    assert post(client, profile, other_token, pin="654321", key="other").status_code == 403
    assert client.get("/api/v1/me/wallet/").data["balance"] == 1000


@pytest.mark.django_db
def test_provider_owner_scoped_pin_and_qr(domain):
    _, _, _, _, provider, other, _, _ = domain
    owner = User.objects.create_user("owner@example.test", "Secret-123", role="PROVIDER")
    ProviderMembership.objects.create(user=owner, provider=provider)
    client = authorized(owner)
    url = f"/api/v1/provider/providers/{provider.pk}/consumption-credential/"
    assert "token=" in client.get(url).data["qr_url"]
    assert "pin" not in client.get(url).data
    assert client.put(url, {"pin": "222222", "provider": str(other.pk)}, format="json").status_code == 200
    assert client.put(f"/api/v1/provider/providers/{other.pk}/consumption-credential/", {"pin": "222222"}, format="json").status_code == 404
    assert client.get("/api/v1/me/wallet/").status_code == 403


@pytest.mark.django_db
def test_annul_freeze_resolution_and_progress_independent_of_spending(domain):
    tourist, _, admin, profile, provider, other, token, other_token = domain
    client = authorized(tourist)
    first = post(client, profile, token)
    assert first.status_code == 201
    with transaction.atomic():
        debit_wallet(tourist.pk, 800, "order:1:debit")
    case = annul_consumption(first.data["id"], admin, "Beneficio no otorgado")
    assert case.shortfall == 800
    assert Wallet.objects.get(tourist=tourist).redemptions_frozen
    with transaction.atomic(), pytest.raises(Conflict):
        debit_wallet(tourist.pk, 1, "order:2:debit")
    assert post(client, profile, other_token, pin="654321", key="other").status_code == 201
    assert client.get("/api/v1/me/progress/").data["total"] == 1
    resolve_adjustment(case.pk, admin, AdjustmentCase.Resolution.REVERSAL, "Saldo recuperado")
    wallet = Wallet.objects.get(tourist=tourist)
    assert wallet.balance == 200 and not wallet.redemptions_frozen
    assert WalletEntry.objects.filter(wallet=wallet).aggregate(total=Sum("delta"))["total"] == wallet.balance
    with pytest.raises(Conflict):
        annul_consumption(first.data["id"], admin, "Duplicado")
    assert post(client, profile, token, key="fresh-after-annul").status_code == 409


@pytest.mark.django_db
def test_multiple_pending_cases_and_audited_funding_or_forgiveness(domain):
    tourist, _, admin, profile, _, _, token, other_token = domain
    one = award_consumption(tourist, profile.pk, token, "123456", "one")[0]
    two = award_consumption(tourist, profile.pk, other_token, "654321", "two")[0]
    with transaction.atomic():
        debit_wallet(tourist.pk, 1900, "order:bulk")
    case1 = annul_consumption(one["id"], admin, "Error uno")
    case2 = annul_consumption(two["id"], admin, "Error dos")
    resolve_adjustment(case1.pk, admin, AdjustmentCase.Resolution.FUNDED, "Aporte aprobado")
    case1.refresh_from_db()
    assert case1.shortfall == 900 and case1.funded_amount == 900
    assert Wallet.objects.get(tourist=tourist).redemptions_frozen
    resolve_adjustment(case2.pk, admin, AdjustmentCase.Resolution.FORGIVEN, "Pérdida aprobada")
    case2.refresh_from_db()
    assert case2.shortfall == 900 and case2.forgiven_amount == 1000
    wallet = Wallet.objects.get(tourist=tourist)
    assert wallet.balance == 0 and not wallet.redemptions_frozen
    assert WalletEntry.objects.filter(wallet=wallet).aggregate(total=Sum("delta"))["total"] == 0


@pytest.mark.django_db
def test_refund_is_linked_capped_idempotent_and_history_is_database_immutable(domain):
    tourist, second, _, profile, _, _, token, _ = domain
    award_consumption(tourist, profile.pk, token, "123456", "award")
    with transaction.atomic():
        debit_wallet(tourist.pk, 600, "order:one:debit")
    with transaction.atomic():
        refund_wallet(tourist.pk, 400, "order:one:refund-a", debit_reference="order:one:debit")
    with transaction.atomic():
        refund_wallet(tourist.pk, 400, "order:one:refund-a", debit_reference="order:one:debit")
    with transaction.atomic(), pytest.raises(Conflict):
        refund_wallet(tourist.pk, 201, "order:one:refund-b", debit_reference="order:one:debit")
    with transaction.atomic(), pytest.raises(Conflict):
        credit_wallet(second.pk, 400, "order:one:refund-a")
    assert not Wallet.objects.filter(tourist=second, balance__gt=0).exists()
    assert Wallet.objects.get(tourist=tourist).balance == 800
    entry = WalletEntry.objects.get(reference="order:one:refund-a")
    assert entry.source_entry.reference == "order:one:debit"
    with pytest.raises(DatabaseError), transaction.atomic(), connections["default"].cursor() as cursor:
        cursor.execute("UPDATE credits_walletentry SET delta = 999 WHERE id = %s", [entry.pk])
    consumption = Consumption.objects.get(tourist=tourist)
    with pytest.raises(DatabaseError), transaction.atomic(), connections["default"].cursor() as cursor:
        cursor.execute("DELETE FROM credits_consumption WHERE id = %s", [consumption.pk])


@pytest.mark.django_db
def test_own_history_and_scope_checks(domain):
    tourist, second, _, profile, _, _, token, _ = domain
    award_consumption(tourist, profile.pk, token, "123456", "one")
    own = authorized(tourist)
    other_client = authorized(second)
    assert len(own.get("/api/v1/me/consumptions/").data) == 1
    assert other_client.get("/api/v1/me/consumptions/").data == []
    assert other_client.get("/api/v1/me/wallet/").data["balance"] == 0
    assert other_client.get("/api/v1/me/progress/").data["total"] == 0
    assert own.get("/api/v1/me/consumptions/")["Cache-Control"] == "no-store"
    outsider_provider = Provider.objects.create(slug="outside", name="Outside", status=Publication.PUBLISHED)
    set_provider_pin(outsider_provider.pk, "987654")
    outside_qr = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=outsider_provider))
    assert post(other_client, profile, outside_qr, pin="987654", key="outside").status_code == 403
    second.is_active = False
    second.save(update_fields=["is_active"])
    assert post(other_client, profile, token, key="inactive").status_code == 401


@pytest.mark.django_db
def test_admin_actions_require_reason_and_do_not_allow_standard_edit(domain):
    tourist, _, admin, profile, _, _, token, _ = domain
    item = award_consumption(tourist, profile.pk, token, "123456", "one")[0]
    site = AdminSite()
    consumption_admin = ConsumptionAdmin(Consumption, site)
    adjustment_admin = AdjustmentAdmin(AdjustmentCase, site)
    from django.test import RequestFactory
    request = RequestFactory().get("/admin/credits/consumption/")
    request.user = admin
    assert not consumption_admin.has_add_permission(request)
    assert not consumption_admin.has_change_permission(request)
    assert not consumption_admin.has_delete_permission(request)
    assert "annul_selected" in consumption_admin.get_actions(request)
    assert "resolve_selected" in adjustment_admin.get_actions(request)
    from django.test import Client
    client = Client()
    client.force_login(admin)
    url = "/admin/credits/consumption/"
    payload = {"action": "annul_selected", "_selected_action": item["id"], "select_across": "0", "index": "0"}
    assert client.post(url, payload).status_code == 302
    assert Consumption.objects.get(pk=item["id"]).state == Consumption.State.VALID
    payload["reason"] = "Error verificado"
    assert client.post(url, payload).status_code == 302
    assert Consumption.objects.get(pk=item["id"]).state == Consumption.State.ANNULLED


@pytest.mark.django_db
def test_seed_creates_idempotent_verified_and_frozen_demo(tmp_path):
    destination = tmp_path / "e4-credentials.md"
    with override_settings(DEBUG=True, DEMO_CREDENTIALS_PATH=destination):
        call_command("seed_demo")
        assert Consumption.objects.count() >= 4
        assert User.objects.filter(email_verified=True, role=User.Role.TOURIST).count() >= 3
        frozen = Wallet.objects.get(tourist__email="turista.ajuste@llaveextra.test")
        assert frozen.redemptions_frozen
        assert AdjustmentCase.objects.filter(consumption__tourist=frozen.tourist,
                                             resolved_at__isnull=True).count() == 1
        content = destination.read_text(encoding="utf-8")
        assert "PIN de consumo demo E4" in content
        call_command("seed_demo")
        assert destination.read_text(encoding="utf-8") == content
        assert Consumption.objects.count() >= 4


@pytest.mark.django_db
def test_consumption_limit_fails_closed_if_redis_unavailable(domain):
    tourist, _, _, profile, _, _, token, _ = domain
    client = authorized(tourist)
    with override_settings(REDIS_URL="redis://127.0.0.1:1/1"):
        assert post(client, profile, token).status_code == 429
    assert Consumption.objects.count() == 0
    assert post(client, profile, token).status_code == 201
    with override_settings(REDIS_URL="redis://127.0.0.1:1/1"):
        assert post(client, profile, token).status_code == 201
        assert post(client, profile, token, key="new").status_code == 429


@pytest.mark.django_db(transaction=True)
def test_concurrent_awards_and_wallet_debits_serialize(domain):
    tourist, _, _, profile, _, _, token, _ = domain

    def award(key):
        connections.close_all()
        try:
            return award_consumption(tourist, profile.pk, token, "123456", key)[1]
        except Conflict:
            return 409
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(award, ("parallel-1", "parallel-2")))
    assert sorted(results) == [201, 409]
    assert Consumption.objects.count() == 1 and Wallet.objects.get(tourist=tourist).balance == 1000

    def debit(reference):
        connections.close_all()
        try:
            with transaction.atomic():
                debit_wallet(tourist.pk, 800, reference)
            return 200
        except Conflict:
            return 409
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(debit, ("order:a", "order:b")))
    assert sorted(results) == [200, 409]
    wallet = Wallet.objects.get(tourist=tourist)
    assert wallet.balance == 200
    assert WalletEntry.objects.filter(wallet=wallet).aggregate(total=Sum("delta"))["total"] == 200


@pytest.mark.django_db(transaction=True)
def test_revocation_waits_for_award_lock_and_prevents_late_award(domain):
    tourist, _, _, profile, _, _, token, _ = domain
    held = Event()
    release = Event()
    worker_pid: Queue[int] = Queue()

    def revoke():
        connections.close_all()
        with transaction.atomic():
            row = CollaboratorProfile.objects.select_for_update().get(pk=profile.pk)
            row.enabled = False
            row.save(update_fields=["enabled"])
            held.set()
            release.wait(5)
        connections.close_all()

    def earn():
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            award_consumption(tourist, profile.pk, token, "123456", "late")
            return 201
        except PermissionDenied:
            return 403
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(revoke)
        assert held.wait(5)
        second = pool.submit(earn)
        pid = worker_pid.get(timeout=5)
        deadline = monotonic() + 5
        blocked = False
        while monotonic() < deadline:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT cardinality(pg_blocking_pids(%s))", [pid])
                blocked = cursor.fetchone()[0] > 0
            if blocked:
                break
            sleep(0.02)
        assert blocked, "La acreditación no esperó el bloqueo de revocación"
        release.set()
        first.result()
        assert second.result() == 403
    assert Consumption.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_benefit_withdrawal_serializes_with_direct_award(domain):
    tourist, _, _, _, provider, _, token, _ = domain
    benefit = Benefit.objects.get(provider=provider)
    held = Event()
    release = Event()
    worker_pid: Queue[int] = Queue()

    def withdraw():
        connections.close_all()
        try:
            with transaction.atomic():
                row = Benefit.objects.select_for_update().get(pk=benefit.pk)
                row.status = Publication.DRAFT
                row.save(update_fields=["status"])
                held.set()
                release.wait(5)
        finally:
            connections.close_all()

    def earn():
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            award_consumption(tourist, None, token, "123456", "withdrawal-race")
            return 201
        except PermissionDenied:
            return 403
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(withdraw)
        assert held.wait(5)
        second = pool.submit(earn)
        pid = worker_pid.get(timeout=5)
        deadline = monotonic() + 5
        blocked = False
        while monotonic() < deadline:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT cardinality(pg_blocking_pids(%s))", [pid])
                blocked = cursor.fetchone()[0] > 0
            if blocked:
                break
            sleep(0.02)
        assert blocked, "La acreditación no esperó el bloqueo del beneficio"
        release.set()
        first.result()
        assert second.result() == 403
    assert Consumption.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_concurrent_earning_and_adjustment_resolution_keep_ledger_balanced(domain):
    tourist, _, admin, profile, _, _, token, other_token = domain
    first = award_consumption(tourist, profile.pk, token, "123456", "first")[0]
    with transaction.atomic():
        debit_wallet(tourist.pk, 800, "order:spent")
    case = annul_consumption(first["id"], admin, "Error")

    def earn():
        close_old_connections()
        try:
            return award_consumption(tourist, profile.pk, other_token, "654321", "second")[1]
        finally:
            connections.close_all()

    def resolve():
        close_old_connections()
        try:
            try:
                resolve_adjustment(case.pk, admin, AdjustmentCase.Resolution.REVERSAL, "Saldo recuperado")
                return 200
            except Conflict:
                return 409
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(lambda fn: fn(), (earn, resolve)))
    assert result[0] == 201 and result[1] in (200, 409)
    if result[1] == 409:
        resolve_adjustment(case.pk, admin, AdjustmentCase.Resolution.REVERSAL, "Saldo recuperado")
    wallet = Wallet.objects.get(tourist=tourist)
    assert wallet.balance == 200 and not wallet.redemptions_frozen
    assert WalletEntry.objects.filter(wallet=wallet).aggregate(total=Sum("delta"))["total"] == wallet.balance
