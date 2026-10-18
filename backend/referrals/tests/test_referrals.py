from concurrent.futures import ThreadPoolExecutor

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import Permission
from django.db import DatabaseError, connections, transaction
from django.test import RequestFactory
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from referrals.access import active_folder_access, locked_folder_access, sign_qr
from referrals.admin import CollaboratorProfileAdmin
from referrals.models import CollaboratorProfile, FolderAccess


def authorized(user):
    access, _ = issue_session(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.mark.django_db
def test_qr_redeem_is_private_idempotent_and_user_bound():
    collaborator = User.objects.create_user("collab@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    tourist = User.objects.create_user("tourist@example.test", "Secret-123")
    another = User.objects.create_user("other@example.test", "Secret-123")
    token = sign_qr(profile)
    anonymous = APIClient()
    assert anonymous.get("/api/v1/me/folders/").status_code == 401
    assert anonymous.get("/api/v1/collaborator/qr/").status_code == 401
    assert anonymous.post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 401
    client = authorized(tourist)
    assert client.post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 200
    assert client.post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 200
    assert FolderAccess.objects.count() == 1
    assert len(client.get("/api/v1/me/folders/").data["folders"]) == 1
    assert authorized(another).get("/api/v1/me/folders/").data["folders"] == []
    assert not active_folder_access(another, profile)


@pytest.mark.django_db
def test_qr_forgery_rotation_disable_and_role_change():
    collaborator = User.objects.create_user("collab@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    tourist = User.objects.create_user("tourist@example.test", "Secret-123")
    client = authorized(tourist)
    token = sign_qr(profile)
    forged = client.post("/api/v1/referrals/redeem/", {"token": token + "x"}, format="json")
    assert forged.status_code == 400
    assert forged["Cache-Control"] == "no-store" and forged["Referrer-Policy"] == "no-referrer"
    assert client.post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 200
    assert active_folder_access(tourist, profile)
    stale_profile = CollaboratorProfile.objects.get(pk=profile.pk)
    CollaboratorProfile.rotate(profile.pk)
    assert not active_folder_access(tourist, stale_profile)
    profile.refresh_from_db()
    assert not active_folder_access(tourist, profile)
    assert client.post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 400
    current = sign_qr(profile)
    assert client.post("/api/v1/referrals/redeem/", {"token": current}, format="json").status_code == 200
    CollaboratorProfile.set_enabled(profile.pk, False)
    profile.refresh_from_db()
    assert not active_folder_access(tourist, profile)
    assert client.get("/api/v1/me/folders/").data["folders"] == []
    assert FolderAccess.objects.count() == 2
    collaborator.role = "PROVIDER"
    collaborator.save(update_fields=["role"])
    CollaboratorProfile.set_enabled(profile.pk, True)
    profile.refresh_from_db()
    assert not active_folder_access(tourist, profile)
    assert client.post("/api/v1/referrals/redeem/", {"token": current}, format="json").status_code == 400
    collaborator.role = "COLLABORATOR"
    collaborator.save(update_fields=["role"])
    tourist.role = "PROVIDER"
    tourist.save(update_fields=["role"])
    assert not active_folder_access(tourist, profile)


@pytest.mark.django_db
def test_provider_and_collaborator_do_not_acquire_tourist_permissions():
    collaborator = User.objects.create_user("collab@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    provider = User.objects.create_user("provider@example.test", "Secret-123", role="PROVIDER")
    token = sign_qr(profile)
    assert authorized(provider).post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 403
    assert authorized(provider).get("/api/v1/collaborator/qr/").status_code == 403
    collab_client = authorized(collaborator)
    assert collab_client.post("/api/v1/referrals/redeem/", {"token": token}, format="json").status_code == 403
    qr = collab_client.get("/api/v1/collaborator/qr/")
    assert qr.status_code == 200 and "/referencia#token=" in qr.data["url"]
    assert "Cache-Control" in qr and qr["Referrer-Policy"] == "no-referrer"
    assert collab_client.get("/api/v1/collaborator/qr.png").status_code == 200
    provider.is_staff = True
    provider.save(update_fields=["is_staff"])
    provider.user_permissions.add(Permission.objects.get(codename="change_collaboratorprofile"))
    assert provider.has_perm("referrals.change_collaboratorprofile")
    request = RequestFactory().get("/admin/")
    request.user = provider
    assert not CollaboratorProfileAdmin(CollaboratorProfile, AdminSite()).has_change_permission(request)


@pytest.mark.django_db
def test_locked_gate_and_registration_invalid_referral():
    collaborator = User.objects.create_user("collab@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    tourist = User.objects.create_user("tourist@example.test", "Secret-123")
    authorized(tourist).post("/api/v1/referrals/redeem/", {"token": sign_qr(profile)}, format="json")
    with locked_folder_access(tourist, profile.pk) as locked:
        assert locked.pk == profile.pk
    assert not active_folder_access(collaborator, profile)
    client = APIClient()
    response = client.post("/api/v1/auth/register/", {"email": "new@example.test", "password": "Test-Password-789!", "referral_token": "invalid"}, format="json")
    assert response.status_code == 400
    assert not User.objects.filter(email="new@example.test").exists()
    accepted = client.post("/api/v1/auth/register/", {
        "email": "new@example.test", "password": "Test-Password-789!", "referral_token": sign_qr(profile),
    }, format="json")
    assert accepted.status_code == 201
    assert FolderAccess.objects.filter(tourist__email="new@example.test", collaborator=profile).count() == 1


@pytest.mark.django_db(transaction=True)
def test_locked_gate_holds_profile_row_for_e4_transaction():
    collaborator = User.objects.create_user("collab-lock@example.test", "Secret-123", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    tourist = User.objects.create_user("tourist-lock@example.test", "Secret-123")
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=1)

    def competing_lock():
        try:
            with transaction.atomic():
                CollaboratorProfile.objects.select_for_update(nowait=True).get(pk=profile.pk)
            return "unlocked"
        except DatabaseError:
            return "locked"
        finally:
            connections.close_all()

    with locked_folder_access(tourist, profile.pk):
        with ThreadPoolExecutor(max_workers=1) as pool:
            assert pool.submit(competing_lock).result(timeout=5) == "locked"
