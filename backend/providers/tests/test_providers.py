from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO
from queue import Queue
from time import monotonic, sleep

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, connection, connections, transaction
from django.test import Client, RequestFactory, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from providers.access import locked_provider_eligibility
from providers.admin import (
    BenefitAdmin,
    FolderProviderAdmin,
    ProviderAdmin,
    ProviderMembershipAdmin,
)
from providers.models import Benefit, FolderProvider, Provider, ProviderMembership, Publication
from providers.serializers import BenefitWriteSerializer, ProviderWriteSerializer
from referrals.models import CollaboratorProfile, FolderAccess


def authorized(user):
    token, _ = issue_session(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def image(format="PNG", size=(8, 8)):
    output = BytesIO()
    Image.new("RGB", size, "red").save(output, format=format)
    return SimpleUploadedFile("photo.png", output.getvalue(), content_type="image/png")


@pytest.fixture
def domain():
    tourist = User.objects.create_user("tourist@example.test", "Secret-123")
    collaborator = User.objects.create_user("collab@example.test", "Secret-123", role="COLLABORATOR")
    other_collaborator = User.objects.create_user("othercollab@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    other_profile = CollaboratorProfile.objects.create(user=other_collaborator, enabled=True)
    provider = Provider.objects.create(slug="one", name="One", status=Publication.PUBLISHED)
    other_provider = Provider.objects.create(slug="two", name="Two", status=Publication.PUBLISHED)
    FolderProvider.assign(profile.pk, provider.pk)
    FolderProvider.assign(other_profile.pk, other_provider.pk)
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=profile.qr_version)
    benefit = Benefit.objects.create(provider=provider, title="10%", conditions="Con reserva", status=Publication.PUBLISHED)
    return tourist, profile, other_profile, provider, other_provider, benefit


@pytest.mark.django_db
def test_tourist_lists_details_and_direct_ids_are_folder_scoped(domain):
    tourist, profile, other_profile, provider, other_provider, benefit = domain
    client = authorized(tourist)
    root = f"/api/v1/folders/{profile.pk}/providers/"
    assert APIClient().get(root).status_code == 401
    response = client.get(root, {"search": "Two"})
    assert response.status_code == 200
    assert [item["id"] for item in response.data] == [str(provider.pk)]
    assert client.get(f"/api/v1/folders/{other_profile.pk}/providers/").status_code == 404
    assert client.get(f"{root}{other_provider.pk}/").status_code == 404
    assert client.get(f"{root}{provider.pk}/benefits/{benefit.pk}/").status_code == 200
    assert client.get(f"{root}{other_provider.pk}/benefits/").status_code == 404
    FolderProvider.remove(profile.pk, provider.pk)
    assert client.get(root).data == []
    assert client.get(f"{root}{provider.pk}/").status_code == 404


@pytest.mark.django_db
def test_revocation_publication_and_validity_apply_to_every_route(domain):
    tourist, profile, _, provider, _, benefit = domain
    client = authorized(tourist)
    root = f"/api/v1/folders/{profile.pk}/providers/{provider.pk}/"
    benefit_url = f"{root}benefits/{benefit.pk}/"
    assert client.get(benefit_url).status_code == 200
    Benefit.set_status(benefit.pk, Publication.DRAFT)
    assert client.get(benefit_url).status_code == 404
    Benefit.set_status(benefit.pk, Publication.PUBLISHED)
    benefit.valid_until = timezone.localdate() - timedelta(days=1)
    benefit.save(update_fields=["valid_until"])
    assert client.get(benefit_url).status_code == 404
    benefit.valid_until = None
    benefit.save(update_fields=["valid_until"])
    Provider.set_status(provider.pk, Publication.INACTIVE)
    assert client.get(root).status_code == 404
    Provider.set_status(provider.pk, Publication.PUBLISHED)
    CollaboratorProfile.rotate(profile.pk)
    assert client.get(root).status_code == 404
    assert client.get(benefit_url).status_code == 404
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=2)
    CollaboratorProfile.set_enabled(profile.pk, False)
    assert client.get(root).status_code == 404


@pytest.mark.django_db
def test_provider_ownership_offer_review_and_mass_assignment(domain):
    _, profile, _, provider, other_provider, benefit = domain
    owner = User.objects.create_user("owner@example.test", "Secret-123", role="PROVIDER")
    ProviderMembership.objects.create(user=owner, provider=provider)
    client = authorized(owner)
    root = f"/api/v1/provider/providers/{provider.pk}/"
    assert client.get("/api/v1/provider/providers/").status_code == 200
    assert client.get(f"/api/v1/provider/providers/{other_provider.pk}/").status_code == 404
    bad = client.patch(root, {"status": "PUBLISHED", "name": "Hacked", "role": "ADMIN"}, format="json")
    assert bad.status_code == 400
    assert client.patch(root, {"description": "Descripción propia"}, format="json").status_code == 200
    assert client.patch(f"/api/v1/provider/providers/{other_provider.pk}/", {"description": "bad"}, format="json").status_code == 404
    offers = f"{root}benefits/"
    assert client.post(offers, {"title": "Nueva", "conditions": "Con reserva", "provider": str(other_provider.pk), "status": "PUBLISHED"}, format="json").status_code == 400
    created = client.post(offers, {"title": "Nueva", "conditions": "Con reserva"}, format="json")
    assert created.status_code == 201
    new = Benefit.objects.get(pk=created.data["id"])
    assert new.provider == provider and new.status == Publication.DRAFT
    assert client.patch(f"{offers}{benefit.pk}/", {"conditions": "Nuevas condiciones"}, format="json").status_code == 200
    benefit.refresh_from_db()
    assert benefit.status == Publication.DRAFT
    assert client.delete(f"{offers}{new.pk}/").status_code == 204
    assert not Benefit.objects.filter(pk=new.pk).exists()
    other_draft = Benefit.objects.create(provider=provider, title="Otra", conditions="Con reserva")
    ProviderMembership.objects.filter(user=owner, provider=provider).delete()
    assert client.delete(f"{offers}{other_draft.pk}/").status_code == 404
    assert Benefit.objects.filter(pk=other_draft.pk).exists()
    assert authorized(profile.user).patch(root, {"description": "bad"}, format="json").status_code == 403


@pytest.mark.django_db
def test_stale_provider_edit_keeps_admin_publication_and_benefit_requires_review(domain):
    _, _, _, provider, _, benefit = domain
    stale_provider = Provider.objects.get(pk=provider.pk)
    Benefit.set_status(benefit.pk, Publication.DRAFT)
    stale_benefit = Benefit.objects.get(pk=benefit.pk)
    Provider.set_status(provider.pk, Publication.INACTIVE)
    Benefit.set_status(benefit.pk, Publication.PUBLISHED)

    provider_edit = ProviderWriteSerializer(stale_provider, data={"description": "Ficha corregida"}, partial=True)
    provider_edit.is_valid(raise_exception=True)
    provider_edit.save()
    benefit_edit = BenefitWriteSerializer(stale_benefit, data={"conditions": "Otras condiciones"}, partial=True)
    benefit_edit.is_valid(raise_exception=True)
    benefit_edit.save()

    provider.refresh_from_db()
    benefit.refresh_from_db()
    assert provider.status == Publication.INACTIVE and provider.description == "Ficha corregida"
    assert benefit.status == Publication.DRAFT and benefit.conditions == "Otras condiciones"


@pytest.mark.django_db
def test_private_media_decoding_and_revocation(domain):
    tourist, profile, _, provider, other_provider, benefit = domain
    owner = User.objects.create_user("owner@example.test", "Secret-123", role="PROVIDER")
    ProviderMembership.objects.create(user=owner, provider=provider)
    owner_client = authorized(owner)
    provider_url = f"/api/v1/provider/providers/{provider.pk}/"
    assert owner_client.patch(provider_url, {"image": SimpleUploadedFile("evil.svg", b"<svg></svg>", content_type="image/svg+xml")}, format="multipart").status_code == 400
    assert owner_client.patch(provider_url, {"image": SimpleUploadedFile("large.png", b"x" * (5 * 1024 * 1024 + 1), content_type="image/png")}, format="multipart").status_code == 400
    assert owner_client.patch(provider_url, {"image": image(size=(4097, 1))}, format="multipart").status_code == 400
    assert owner_client.patch(provider_url, {"image": image()}, format="multipart").status_code == 200
    benefit_url = f"{provider_url}benefits/{benefit.pk}/"
    assert owner_client.patch(benefit_url, {"image": image()}, format="multipart").status_code == 200
    provider.refresh_from_db()
    benefit.refresh_from_db()
    media = f"/api/v1/folders/{profile.pk}/providers/{provider.pk}/media/"
    benefit_media = f"/api/v1/folders/{profile.pk}/providers/{provider.pk}/benefits/{benefit.pk}/media/"
    assert APIClient().get(media).status_code == 401
    assert APIClient().get(benefit_media).status_code == 401
    assert authorized(tourist).get(media).status_code == 200
    assert authorized(tourist).get(benefit_media).status_code == 404
    Benefit.set_status(benefit.pk, Publication.PUBLISHED)
    assert authorized(tourist).get(benefit_media).status_code == 200
    assert authorized(tourist).get(f"/api/v1/folders/{profile.pk}/providers/{other_provider.pk}/media/").status_code == 404
    CollaboratorProfile.set_enabled(profile.pk, False)
    assert authorized(tourist).get(media).status_code == 404
    assert authorized(tourist).get(benefit_media).status_code == 404
    assert provider.image.name.startswith("providers/")
    assert provider.image.url.startswith("/api/v1/admin/private-media/")
    assert APIClient().get(provider.image.url).status_code == 401
    assert authorized(owner).get(provider.image.url).status_code == 401


@pytest.mark.django_db(transaction=True)
def test_e4_eligibility_holds_provider_lock_and_rechecks_folder():
    tourist = User.objects.create_user("e4-tourist@example.test", "Secret-123")
    collaborator = User.objects.create_user("e4-collab@example.test", "Secret-123", role=User.Role.COLLABORATOR)
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    provider = Provider.objects.create(slug="e4-provider", name="E4 provider", status=Publication.PUBLISHED)
    FolderProvider.assign(profile.pk, provider.pk)
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=profile.qr_version)

    def competing_lock():
        try:
            with transaction.atomic():
                Provider.objects.select_for_update(nowait=True).get(pk=provider.pk)
            return "unlocked"
        except DatabaseError:
            return "locked"
        finally:
            connections.close_all()

    with locked_provider_eligibility(tourist, profile.pk, provider.pk) as (locked_profile, locked_provider):
        assert locked_profile.pk == profile.pk and locked_provider.pk == provider.pk
        with ThreadPoolExecutor(max_workers=1) as pool:
            assert pool.submit(competing_lock).result(timeout=5) == "locked"

    FolderProvider.remove(profile.pk, provider.pk)
    from rest_framework.exceptions import PermissionDenied

    with pytest.raises(PermissionDenied, match="Prestador no habilitado"):
        with locked_provider_eligibility(tourist, profile.pk, provider.pk):
            pass


@pytest.mark.django_db
def test_collaborator_folder_is_read_only_and_enabled(domain):
    _, profile, _, provider, _, _ = domain
    client = authorized(profile.user)
    response = client.get("/api/v1/collaborator/folder/")
    assert response.status_code == 200
    assert response.data["providers"][0]["id"] == str(provider.pk)
    assert client.patch("/api/v1/collaborator/folder/", {"providers": []}, format="json").status_code == 405
    CollaboratorProfile.set_enabled(profile.pk, False)
    assert client.get("/api/v1/collaborator/folder/").status_code == 403


@pytest.mark.django_db
def test_only_admin_can_assign_folder_even_when_provider_has_django_permission(domain):
    _, profile, _, _, other_provider, _ = domain
    provider_user = User.objects.create_user(
        "assigned-provider@example.test", "Secret-123", role=User.Role.PROVIDER, is_staff=True,
    )
    provider_user.user_permissions.add(Permission.objects.get(codename="add_folderprovider"))
    admin_user = User.objects.create_superuser("folder-admin@example.test", "Secret-123")
    model_admin = FolderProviderAdmin(FolderProvider, AdminSite())
    request = RequestFactory().get("/admin/providers/folderprovider/add/")

    request.user = provider_user
    assert not model_admin.has_add_permission(request)
    request.user = admin_user
    assert model_admin.has_add_permission(request)
    model_admin.save_model(
        request, FolderProvider(collaborator=profile, provider=other_provider), form=None, change=False,
    )
    assert FolderProvider.objects.filter(collaborator=profile, provider=other_provider).exists()


@pytest.mark.django_db
def test_staff_provider_cannot_delete_admin_models_with_explicit_django_permissions(domain):
    _, profile, _, provider, _, _ = domain
    assignment = FolderProvider.objects.get(collaborator=profile, provider=provider)
    staff_provider = User.objects.create_user(
        "delete-provider@example.test", "Secret-123", role=User.Role.PROVIDER, is_staff=True,
    )
    admin_user = User.objects.create_superuser("delete-admin@example.test", "Secret-123")
    admin_models = (
        (Provider, ProviderAdmin), (ProviderMembership, ProviderMembershipAdmin),
        (FolderProvider, FolderProviderAdmin), (Benefit, BenefitAdmin),
    )
    staff_provider.user_permissions.add(*[
        Permission.objects.get(content_type__app_label="providers", codename=f"delete_{model._meta.model_name}")
        for model, _ in admin_models
    ])
    request = RequestFactory().get("/admin/providers/folderprovider/")
    request.user = staff_provider
    for model, admin_class in admin_models:
        assert not admin_class(model, AdminSite()).has_delete_permission(request)
    folder_admin = FolderProviderAdmin(FolderProvider, AdminSite())
    assert "delete_selected" not in folder_admin.get_actions(request)

    client = Client()
    client.force_login(staff_provider)
    delete_url = f"/admin/providers/folderprovider/{assignment.pk}/delete/"
    assert client.post(delete_url, {"post": "yes"}).status_code == 403
    assert FolderProvider.objects.filter(pk=assignment.pk).exists()

    request.user = admin_user
    assert folder_admin.has_delete_permission(request)
    assert "delete_selected" in folder_admin.get_actions(request)


@pytest.mark.django_db(transaction=True)
def test_provider_delete_waits_for_admin_publication_and_keeps_published_benefit():
    provider = Provider.objects.create(slug="race-delete", name="Race delete", status=Publication.PUBLISHED)
    owner = User.objects.create_user("race-owner@example.test", "Secret-123", role=User.Role.PROVIDER)
    ProviderMembership.objects.create(user=owner, provider=provider)
    benefit = Benefit.objects.create(provider=provider, title="Oferta", conditions="Con reserva")
    token, _ = issue_session(owner)
    delete_url = f"/api/v1/provider/providers/{provider.pk}/benefits/{benefit.pk}/"
    worker_pid: Queue[int] = Queue()

    def delete_from_other_connection():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            return client.delete(delete_url).status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            Benefit.set_status(benefit.pk, Publication.PUBLISHED)
            result = pool.submit(delete_from_other_connection)
            pid = worker_pid.get(timeout=5)
            deadline = monotonic() + 5
            blocked = False
            while monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT cardinality(pg_blocking_pids(%s))", [pid])
                    blocked = cursor.fetchone()[0] > 0
                if blocked:
                    break
                sleep(0.02)
            assert blocked, "DELETE no esperó el lock de publicación"
        assert result.result(timeout=5) == 403
    benefit.refresh_from_db()
    assert benefit.status == Publication.PUBLISHED


@pytest.mark.django_db
def test_seed_preflight_has_no_partial_additions(tmp_path):
    existing = User.objects.create_user("admin@llaveextra.test", "Unchanged-123", role="ADMIN")
    credential_path = tmp_path / "credentials.md"
    with override_settings(DEBUG=True, DEMO_CREDENTIALS_PATH=credential_path):
        with pytest.raises(CommandError, match="No se creó ninguna cuenta"):
            call_command("seed_demo")
    assert User.objects.count() == 1
    existing.refresh_from_db()
    assert existing.check_password("Unchanged-123")
    assert not credential_path.exists()


@pytest.mark.django_db
def test_seed_is_initial_only_and_preserves_admin_changes(tmp_path):
    credential_path = tmp_path / "credentials.md"
    with override_settings(DEBUG=True, DEMO_CREDENTIALS_PATH=credential_path):
        call_command("seed_demo")
        first_credentials = credential_path.read_text(encoding="utf-8")
        assert Provider.objects.count() == 12
        assert Benefit.objects.count() == 11
        tiger = Provider.objects.get(legacy_public_id="TIG001")
        cumbre = Provider.objects.get(legacy_public_id="CUM001")
        assert tiger.memberships.count() == 1 and cumbre.memberships.count() == 1
        primary = CollaboratorProfile.objects.get(user__email="colaborador@llaveextra.test")
        assert primary.folder_providers.count() >= 5
        removed = primary.folder_providers.first()
        FolderProvider.remove(primary.pk, removed.provider_id)
        Provider.set_status(tiger.pk, Publication.INACTIVE)
        tiger.name = "Cambio administrativo"
        tiger.save(update_fields=["name"])
        tiger.memberships.all().delete()
        call_command("seed_demo")
        assert credential_path.read_text(encoding="utf-8") == first_credentials
        tiger.refresh_from_db()
        assert tiger.name == "Cambio administrativo" and tiger.status == Publication.INACTIVE
        assert tiger.memberships.count() == 0
        assert not FolderProvider.objects.filter(pk=removed.pk).exists()
        assert Provider.objects.count() == 12
