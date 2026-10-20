import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO
from queue import Queue
from threading import Event
from time import monotonic, sleep
from types import SimpleNamespace

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, connections, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import RequestFactory
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from accounts.models import User
from credits.models import Consumption, ProviderConsumptionCredential, WalletEntry
from credits.services import (
    award_consumption,
    rotate_provider_qr,
    set_provider_pin,
    sign_provider_qr,
)
from providers.admin import FolderBenefitAdmin
from providers.models import (
    Benefit,
    CatalogConfig,
    FolderBenefit,
    FolderProvider,
    Provider,
    ProviderMembership,
    Publication,
)
from providers.tests.test_providers import authorized, image
from referrals.access import redeem_qr, sign_qr
from referrals.models import CollaboratorProfile, FolderAccess


@pytest.fixture
def selection_domain():
    tourist = User.objects.create_user("selection-client@example.test", "Secret-123", email_verified=True)
    owner = User.objects.create_user("selection-owner@example.test", "Secret-123", role="PROVIDER")
    collaborator = User.objects.create_user("selection-collab@example.test", "Secret-123", role="COLLABORATOR")
    other_user = User.objects.create_user("selection-other@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    other_profile = CollaboratorProfile.objects.create(user=other_user, enabled=True)
    provider = Provider.objects.create(slug="selection", name="Comercio", category="Comida", status=Publication.PUBLISHED, demo=True)
    ProviderMembership.objects.create(user=owner, provider=provider)
    provider.image.save("provider.png", image())
    a = Benefit.objects.create(provider=provider, title="Zeta elegida", conditions="Reserva", status=Publication.PUBLISHED)
    b = Benefit.objects.create(provider=provider, title="Alfa ajena", conditions="Reserva", status=Publication.PUBLISHED)
    a.image.save("a.png", image())
    b.image.save("b.png", image())
    FolderProvider.assign(profile.pk, provider.pk)  # Legacy row must never grant access.
    FolderBenefit.assign(other_profile.pk, b.pk)
    redeem_qr(tourist, sign_qr(profile))
    return SimpleNamespace(tourist=tourist, owner=owner, collaborator=collaborator, profile=profile,
                           other_profile=other_profile, provider=provider, a=a, b=b)


def selection_url(benefit):
    return f"/api/v1/collaborator/recommendations/{benefit.pk}/"


@pytest.mark.django_db
def test_concrete_selection_is_only_authority_for_all_private_routes(selection_domain):
    d = selection_domain
    collaborator = authorized(d.collaborator)
    tourist = authorized(d.tourist)
    root = f"/api/v1/folders/{d.profile.pk}/providers/"
    detail = f"{root}{d.provider.pk}/"
    assert tourist.get(root).data == []
    assert tourist.get(detail).status_code == 404
    assert tourist.get(f"{detail}media/").status_code == 404
    assert tourist.get(f"/api/v1/folders/{d.profile.pk}/network/").data["count"] == 0
    assert collaborator.put(selection_url(d.a), {}, format="json").status_code == 201
    assert collaborator.put(selection_url(d.a), {}, format="json").status_code == 200
    assert FolderBenefit.objects.filter(collaborator=d.profile).count() == 1
    assert [row["id"] for row in tourist.get(f"{detail}benefits/").data] == [str(d.a.pk)]
    assert tourist.get(f"{detail}benefits/{d.a.pk}/").status_code == 200
    assert tourist.get(f"{detail}benefits/{d.a.pk}/media/").status_code == 200
    for suffix in ("", "media/"):
        assert tourist.get(f"{detail}benefits/{d.b.pk}/{suffix}").status_code == 404
    network = tourist.get(f"/api/v1/folders/{d.profile.pk}/network/").data
    assert network["count"] == 1 and network["results"][0]["benefit_id"] == d.a.pk
    future = Benefit.objects.create(provider=d.provider, title="Nueva oferta", conditions="Sí", status=Publication.PUBLISHED)
    assert tourist.get(f"{detail}benefits/{future.pk}/").status_code == 404
    assert collaborator.get(f"{selection_url(d.b)}media/").status_code == 404
    assert collaborator.delete(selection_url(d.b)).status_code == 204
    assert FolderBenefit.objects.filter(collaborator=d.other_profile, benefit=d.b).exists()
    assert collaborator.delete(selection_url(d.a)).status_code == 204
    assert collaborator.delete(selection_url(d.a)).status_code == 204
    assert tourist.get(root).data == []
    assert tourist.get(f"{detail}media/").status_code == 404
    assert collaborator.get(f"{selection_url(d.a)}media/").status_code == 404
    assert FolderAccess.objects.filter(collaborator=d.profile).exists()
    assert FolderProvider.objects.filter(collaborator=d.profile).exists()


@pytest.mark.django_db
def test_private_catalog_dto_filters_pagination_and_public_switch(selection_domain):
    d = selection_domain
    client = authorized(d.collaborator)
    CatalogConfig.objects.filter(singleton=1).update(enabled=False)
    assert APIClient().get("/api/v1/catalog/benefits/").status_code == 404
    Benefit.objects.bulk_create([Benefit(provider=d.provider, title=f"Extra {i:02}", conditions="Reserva", status=Publication.PUBLISHED) for i in range(50)])
    root = "/api/v1/collaborator/catalog/benefits/"
    page = client.get(root)
    assert page.status_code == 200 and page.data["count"] == 52
    assert len(page.data["results"]) == 24 and page.data["next"]
    assert len(client.get(root, {"page_size": 100}).data["results"]) == 48
    assert client.get(root, {"search": "Zeta", "category": "comida"}).data["count"] == 1
    assert client.get(root, {"category": "Otra"}).data["count"] == 0
    row = page.data["results"][0]
    assert set(row) == {"id", "title", "description", "conditions", "valid_from", "valid_until", "demo", "provider"}
    assert set(row["provider"]) == {"id", "name", "category", "demo"}
    assert "no-store" in page["Cache-Control"]
    assert client.put(selection_url(d.a), {}, format="json").status_code == 201
    recommendations = client.get("/api/v1/collaborator/recommendations/")
    row = recommendations.data["recommendations"][0]
    assert row["available"] is True and row["benefit_id"] == str(d.a.pk)
    assert row["benefit"]["image_url"] == f"{selection_url(d.a)}media/"
    assert row["benefit"]["provider"]["image_url"] == f"/api/v1/collaborator/folder/providers/{d.provider.pk}/media/"
    assert "provenance" not in str(recommendations.data)
    assert client.get(row["benefit"]["image_url"]).status_code == 200
    assert authorized(d.tourist).get(f"/api/v1/folders/{d.profile.pk}/providers/").data[0]["id"] == str(d.provider.pk)


@pytest.mark.django_db
@pytest.mark.parametrize("unavailable", ["draft", "expired", "future", "provider"])
def test_unavailable_selection_retained_without_draft_content_and_revokes_all_routes(selection_domain, unavailable):
    d = selection_domain
    FolderBenefit.assign(d.profile.pk, d.a.pk)
    if unavailable == "provider":
        Provider.set_status(d.provider.pk, Publication.INACTIVE)
    else:
        if unavailable == "draft":
            d.a.status = Publication.DRAFT
        elif unavailable == "expired":
            d.a.valid_until = timezone.localdate() - timedelta(days=1)
        else:
            d.a.valid_from = timezone.localdate() + timedelta(days=1)
        d.a.save()
    client = authorized(d.collaborator)
    response = client.get("/api/v1/collaborator/recommendations/")
    assert response.data == {"recommendations": [{"benefit_id": str(d.a.pk), "available": False, "benefit": None}]}
    assert client.get("/api/v1/collaborator/folder/").data["providers"] == []
    assert client.get(f"{selection_url(d.a)}media/").status_code == 404
    assert client.put(selection_url(d.a), {}, format="json").status_code == 404
    assert client.get(f"/api/v1/collaborator/folder/providers/{d.provider.pk}/media/").status_code == 404
    tourist = authorized(d.tourist)
    assert tourist.get(f"/api/v1/folders/{d.profile.pk}/providers/").data == []
    assert tourist.get(f"/api/v1/folders/{d.profile.pk}/network/").data["count"] == 0
    set_provider_pin(d.provider.pk, "123456")
    token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=d.provider))
    with pytest.raises(PermissionDenied):
        award_consumption(d.tourist, d.profile.pk, token, "123456", "unavailable")
    assert Consumption.objects.count() == WalletEntry.objects.count() == 0
    if unavailable != "provider":
        # The unselected sibling remains eligible for direct consumption only.
        assert award_consumption(d.tourist, None, token, "123456", "direct-sibling")[1] == 201
    assert FolderBenefit.objects.filter(collaborator=d.profile, benefit=d.a).exists()
    assert client.delete(selection_url(d.a)).status_code == 204


@pytest.mark.django_db
def test_republication_restores_only_original_selection_and_deduplicates_providers(selection_domain):
    d = selection_domain
    FolderBenefit.assign(d.profile.pk, d.a.pk)
    Benefit.set_status(d.a.pk, Publication.DRAFT)
    client = authorized(d.collaborator)
    assert client.get("/api/v1/collaborator/folder/").data["providers"] == []
    Benefit.set_status(d.a.pk, Publication.PUBLISHED)
    assert client.get("/api/v1/collaborator/recommendations/").data["recommendations"][0]["available"] is True
    FolderBenefit.assign(d.profile.pk, d.b.pk)
    assert len(client.get("/api/v1/collaborator/folder/").data["providers"]) == 1
    assert client.delete(selection_url(d.a)).status_code == 204
    assert len(client.get("/api/v1/collaborator/folder/").data["providers"]) == 1
    assert [row["id"] for row in authorized(d.tourist).get(f"/api/v1/folders/{d.profile.pk}/providers/{d.provider.pk}/benefits/").data] == [str(d.b.pk)]


@pytest.mark.django_db
def test_selection_roles_mass_assignment_revocation_and_own_ids(selection_domain):
    d = selection_domain
    client = authorized(d.collaborator)
    for payload in ({"collaborator": str(d.other_profile.pk)}, {"provider": str(d.provider.pk)}, {"status": "PUBLISHED"}, []):
        assert client.put(selection_url(d.a), payload, format="json").status_code == 400
    assert client.generic("PUT", selection_url(d.a), "null", content_type="application/json").status_code == 400
    assert client.put(f"/api/v1/collaborator/recommendations/{uuid.uuid4()}/", {}, format="json").status_code == 404
    assert client.delete(f"/api/v1/collaborator/recommendations/{uuid.uuid4()}/").status_code == 204
    paths = ["/api/v1/collaborator/catalog/benefits/", "/api/v1/collaborator/recommendations/", f"{selection_url(d.a)}media/"]
    for user in (d.tourist, d.owner, User.objects.create_superuser("selection-admin@example.test", "Secret-123")):
        wrong = authorized(user)
        for path in paths:
            assert wrong.get(path).status_code == 403
        assert wrong.put(selection_url(d.a), {}, format="json").status_code == 403
        assert wrong.delete(selection_url(d.a)).status_code == 403
    assert client.put(selection_url(d.a), {}, format="json").status_code == 201
    CollaboratorProfile.rotate(d.profile.pk)
    assert authorized(d.tourist).get(f"/api/v1/folders/{d.profile.pk}/providers/").status_code == 404
    CollaboratorProfile.set_enabled(d.profile.pk, False)
    for path in paths:
        response = client.get(path)
        assert response.status_code == 403 and "no-store" in response["Cache-Control"]
    assert client.put(selection_url(d.a), {}, format="json").status_code == 403
    assert client.delete(selection_url(d.a)).status_code == 403
    assert FolderBenefit.objects.filter(collaborator=d.profile, benefit=d.a).exists()


@pytest.mark.django_db
def test_provider_demo_inheritance_protected_delete_and_own_png(selection_domain):
    d = selection_domain
    client = authorized(d.owner)
    root = f"/api/v1/provider/providers/{d.provider.pk}/"
    assert client.post(f"{root}benefits/", {"title": "Demo nueva", "demo": False}, format="json").status_code == 400
    created = client.post(f"{root}benefits/", {"title": "Demo nueva"}, format="json")
    assert created.status_code == 201 and created.data["demo"] is True
    FolderBenefit.assign(d.profile.pk, d.a.pk)
    assert client.patch(f"{root}benefits/{d.a.pk}/", {"conditions": "Cambio"}, format="json").status_code == 200
    conflict = client.delete(f"{root}benefits/{d.a.pk}/")
    assert conflict.status_code == 409 and "seleccionado" in str(conflict.data)
    assert FolderBenefit.objects.filter(collaborator=d.profile, benefit=d.a).exists()
    png_url = f"{root}consumption-credential/qr.png"
    assert client.get(png_url).status_code == 404
    set_provider_pin(d.provider.pk, "123456")
    response = client.get(png_url)
    assert response.status_code == 200 and response["Content-Type"] == "image/png"
    assert "no-store" in response["Cache-Control"] and response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Disposition"] == 'attachment; filename="consumo.png"'
    credential_json = client.get(f"{root}consumption-credential/").data
    assert Image.open(BytesIO(response.content)).format == "PNG"
    assert set(credential_json) == {"configured", "qr_url"}
    rotate_provider_qr(d.provider.pk)
    assert client.get(png_url).content != response.content
    other = Provider.objects.create(slug="png-other", name="Ajeno")
    assert client.get(f"/api/v1/provider/providers/{other.pk}/consumption-credential/qr.png").status_code == 404
    assert authorized(d.collaborator).get(png_url).status_code == 403
    assert APIClient().get(png_url).status_code == 401
    assert len(client.get("/api/v1/provider/providers/").data) == 1
    with pytest.raises(IntegrityError), transaction.atomic():
        ProviderMembership.objects.create(user=d.owner, provider=other)
    another = User.objects.create_user("same-provider@example.test", "Secret-123", role="PROVIDER")
    ProviderMembership.objects.create(user=another, provider=d.provider)


def wait_for_block(pid):
    deadline = monotonic() + 5
    while monotonic() < deadline:
        with connection.cursor() as cursor:
            cursor.execute("SELECT cardinality(pg_blocking_pids(%s))", [pid])
            if cursor.fetchone()[0]:
                return
        sleep(0.02)
    pytest.fail("La operación concurrente no esperó el bloqueo PostgreSQL")


@pytest.mark.django_db(transaction=True)
def test_remove_serializes_with_award_and_replay_preserves_finances(selection_domain):
    d = selection_domain
    FolderBenefit.assign(d.profile.pk, d.a.pk)
    set_provider_pin(d.provider.pk, "123456")
    token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=d.provider))
    first = award_consumption(d.tourist, d.profile.pk, token, "123456", "original")
    second = User.objects.create_user("race-selection@example.test", "Secret-123", email_verified=True)
    redeem_qr(second, sign_qr(d.profile))
    worker_pid = Queue()

    def earn():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            award_consumption(second, d.profile.pk, token, "123456", "after-removal")
            return 201
        except PermissionDenied:
            return 403
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            FolderBenefit.remove(d.profile.pk, d.a.pk)
            result = pool.submit(earn)
            wait_for_block(worker_pid.get(timeout=5))
        assert result.result(timeout=5) == 403
    assert award_consumption(d.tourist, d.profile.pk, token, "123456", "original") == first
    assert Consumption.objects.count() == WalletEntry.objects.count() == 1
    assert award_consumption(second, None, token, "123456", "direct")[1] == 201
    assert Consumption.objects.get(tourist=second).collaborator is None


@pytest.mark.django_db(transaction=True)
def test_award_serializes_removal_via_admin_and_does_not_lock_joined_collaborator_user(selection_domain):
    d = selection_domain
    FolderBenefit.assign(d.profile.pk, d.a.pk)
    set_provider_pin(d.provider.pk, "123456")
    token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=d.provider))
    worker_pid = Queue()
    selection = FolderBenefit.objects.get(collaborator=d.profile, benefit=d.a)

    def remove_admin():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            FolderBenefitAdmin(FolderBenefit, AdminSite()).delete_model(RequestFactory().get("/"), selection)
        finally:
            connections.close_all()

    def user_lock():
        try:
            with transaction.atomic():
                User.objects.select_for_update(nowait=True).get(pk=d.collaborator.pk)
            return True
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        with transaction.atomic():
            assert award_consumption(d.tourist, d.profile.pk, token, "123456", "holds-profile")[1] == 201
            assert pool.submit(user_lock).result(timeout=5)
            result = pool.submit(remove_admin)
            wait_for_block(worker_pid.get(timeout=5))
        result.result(timeout=5)
    assert not FolderBenefit.objects.filter(pk=selection.pk).exists()
    assert Consumption.objects.count() == WalletEntry.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_put_is_idempotent_and_membership_unique(selection_domain):
    d = selection_domain

    def add():
        try:
            return authorized(d.collaborator).put(selection_url(d.a), {}, format="json").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: add(), range(2))) == [200, 201]
    assert FolderBenefit.objects.filter(collaborator=d.profile, benefit=d.a).count() == 1
    with pytest.raises(IntegrityError), transaction.atomic():
        FolderBenefit.objects.bulk_create([FolderBenefit(collaborator=d.profile, benefit=d.a)])
    changed = FolderBenefit.objects.get(collaborator=d.profile, benefit=d.a)
    changed.collaborator = d.other_profile
    with pytest.raises(ValidationError, match="reasignar"):
        changed.save()
    fresh = User.objects.create_user("membership-race@example.test", "Secret-123", role="PROVIDER")
    other = Provider.objects.create(slug="second-business", name="Otro")

    def membership(provider):
        try:
            with transaction.atomic():
                ProviderMembership.objects.create(user=fresh, provider=provider)
            return "created"
        except IntegrityError:
            return "conflict"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(membership, [d.provider, other])) == ["conflict", "created"]
    assert ProviderMembership.objects.filter(user=fresh).count() == 1


@pytest.mark.django_db(transaction=True)
def test_admin_bulk_removal_locks_all_profiles_before_any_provider(selection_domain):
    d = selection_domain
    FolderBenefit.assign(d.profile.pk, d.a.pk)
    last_profile = max((d.profile, d.other_profile), key=lambda row: row.pk)
    worker_pid = Queue()

    def bulk_remove():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            FolderBenefitAdmin(FolderBenefit, AdminSite()).delete_queryset(
                RequestFactory().get("/"), FolderBenefit.objects.all(),
            )
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            CollaboratorProfile.objects.select_for_update().get(pk=last_profile.pk)
            result = pool.submit(bulk_remove)
            wait_for_block(worker_pid.get(timeout=5))
            # If admin interleaves profile/provider pairs, it already owns this
            # provider and deadlocks with a PUT on the last locked profile.
            Provider.objects.select_for_update(nowait=True).get(pk=d.provider.pk)
            Benefit.objects.select_for_update(nowait=True).get(pk=d.a.pk)
        result.result(timeout=5)
    assert FolderBenefit.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_admin_select_across_keeps_target_snapshot_when_another_profile_adds_selection(selection_domain):
    d = selection_domain
    FolderBenefit.remove(d.other_profile.pk, d.b.pk)
    original, _ = FolderBenefit.assign(d.profile.pk, d.a.pk)
    snapshot_taken, addition_committed = Event(), Event()
    provider_locked, other_profile_locked = Event(), Event()

    def add_and_mutate_other_folder():
        try:
            assert snapshot_taken.wait(5)
            added, _ = FolderBenefit.assign(d.other_profile.pk, d.b.pk)
            addition_committed.set()
            assert provider_locked.wait(5)
            with transaction.atomic():
                CollaboratorProfile.objects.select_for_update().get(pk=d.other_profile.pk)
                other_profile_locked.set()
                # Same order as a PUT. Admin must not discover this profile
                # after locking the shared provider from its initial snapshot.
                Provider.objects.select_for_update().get(pk=d.provider.pk)
            return added.pk
        finally:
            connections.close_all()

    def interleave(execute, sql, params, many, context):
        result = execute(sql, params, many, context)
        if 'FROM "providers_folderbenefit"' in sql and not snapshot_taken.is_set():
            snapshot_taken.set()
            assert addition_committed.wait(5)
        if 'FROM "providers_provider"' in sql and "FOR UPDATE" in sql and not provider_locked.is_set():
            provider_locked.set()
            assert other_profile_locked.wait(5)
        return result

    with ThreadPoolExecutor(max_workers=1) as pool:
        competitor = pool.submit(add_and_mutate_other_folder)
        with connection.execute_wrapper(interleave):
            FolderBenefitAdmin(FolderBenefit, AdminSite()).delete_queryset(
                RequestFactory().post("/", {"select_across": "1"}), FolderBenefit.objects.all(),
            )
        added_pk = competitor.result(timeout=5)
    assert not FolderBenefit.objects.filter(pk=original.pk).exists()
    assert FolderBenefit.objects.filter(pk=added_pk, collaborator=d.other_profile, benefit=d.b).exists()


@pytest.mark.django_db(transaction=True)
def test_migration_snapshots_only_current_offers_and_rejects_multi_business():
    previous = [("providers", "0005_alter_benefit_options_alter_folderprovider_options_and_more")]
    current = [("providers", "0006_folder_benefit_and_unique_business")]
    executor = MigrationExecutor(connection)
    executor.migrate(previous)
    apps = executor.loader.project_state(previous).apps
    user_model = apps.get_model("accounts", "User")
    profile_model = apps.get_model("referrals", "CollaboratorProfile")
    provider_model = apps.get_model("providers", "Provider")
    benefit_model = apps.get_model("providers", "Benefit")
    membership_model = apps.get_model("providers", "ProviderMembership")
    legacy_model = apps.get_model("providers", "FolderProvider")
    owner = user_model.objects.create(email="migration-owner@example.test", role="PROVIDER")
    collaborator = user_model.objects.create(email="migration-collab@example.test", role="COLLABORATOR")
    profile = profile_model.objects.create(user=collaborator, enabled=True)
    provider = provider_model.objects.create(slug="migration", name="Migración", status="PUBLISHED")
    other = provider_model.objects.create(slug="migration-other", name="Otro", status="DRAFT")
    membership_model.objects.create(user=owner, provider=provider)
    duplicate = membership_model.objects.create(user=owner, provider=other)
    legacy_model.objects.create(collaborator=profile, provider=provider)
    legacy_model.objects.create(collaborator=profile, provider=other)
    today = timezone.localdate()
    eligible = benefit_model.objects.create(provider=provider, title="Vigente", conditions="Sí", status="PUBLISHED", valid_from=today, valid_until=today)
    for title, status, start, end in [("Borrador", "DRAFT", None, None), ("Vencida", "PUBLISHED", None, today - timedelta(days=1)), ("Futura", "PUBLISHED", today + timedelta(days=1), None)]:
        benefit_model.objects.create(provider=provider, title=title, conditions="Sí", status=status, valid_from=start, valid_until=end)
    benefit_model.objects.create(provider=other, title="Negocio borrador", conditions="Sí", status="PUBLISHED")
    try:
        with pytest.raises(RuntimeError, match="más de un negocio"):
            MigrationExecutor(connection).migrate(current)
        assert membership_model.objects.filter(user=owner).count() == 2
        duplicate.delete()
        MigrationExecutor(connection).migrate(current)
        assert list(FolderBenefit.objects.values_list("benefit_id", flat=True)) == [eligible.pk]
        assert FolderProvider.objects.count() == 2
        Benefit.objects.create(provider_id=provider.pk, title="Posterior", conditions="Sí", status="PUBLISHED")
        assert FolderBenefit.objects.count() == 1
    finally:
        membership_model.objects.filter(pk=duplicate.pk).delete()
        MigrationExecutor(connection).migrate(current)
