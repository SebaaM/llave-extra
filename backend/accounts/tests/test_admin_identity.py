import pytest
from django.contrib import admin
from django.test import RequestFactory
from rest_framework.test import APIClient

from accounts.models import AuthSession, User

PASSWORD = "Test-Password-789!"


@pytest.mark.django_db
def test_technical_admin_deactivation_reactivation_revokes_old_bearer_and_allows_new_login():
    technical_admin = User.objects.create_superuser("technical-admin@example.test", PASSWORD)
    user = User.objects.create_user("reactivated@example.test", PASSWORD)
    user_admin = admin.site._registry[User]
    request = RequestFactory().post(f"/admin/accounts/user/{user.pk}/change/")
    request.user = technical_admin

    login = APIClient().post(
        "/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json",
    )
    assert login.status_code == 200, login.data
    old_access = login.data["access"]
    old_session = AuthSession.objects.get(user=user)

    user.is_active = False
    user_admin.save_model(request, user, form=None, change=True)
    user.refresh_from_db()
    user.is_active = True
    user_admin.save_model(request, user, form=None, change=True)

    old_bearer = APIClient()
    old_bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
    assert old_bearer.get("/api/v1/auth/me/").status_code == 401
    old_session.refresh_from_db()
    assert old_session.revoked_at is not None

    new_login = APIClient().post(
        "/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json",
    )
    assert new_login.status_code == 200, new_login.data
    new_bearer = APIClient()
    new_bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {new_login.data['access']}")
    assert new_bearer.get("/api/v1/auth/me/").status_code == 200
