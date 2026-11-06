from datetime import timedelta

import pytest
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import AuthSession, User
from accounts.security import issue_session, rotate_session


def logout(access, refresh):
    client = APIClient(enforce_csrf_checks=True)
    csrf = client.get("/api/v1/auth/csrf/").data["csrfToken"]
    client.cookies[settings.REFRESH_COOKIE_NAME] = refresh
    headers = {"HTTP_X_CSRFTOKEN": csrf}
    if access is not None:
        headers["HTTP_AUTHORIZATION"] = f"Bearer {access}"
    return client.post("/api/v1/auth/logout/", **headers)


def expired(access):
    token = AccessToken(access)
    token.set_exp(lifetime=timedelta(seconds=-1))
    return str(token)


@pytest.mark.django_db
def test_logout_with_expired_access_and_own_refresh_revokes_the_session():
    user = User.objects.create_user("logout@example.test")
    access, refresh = issue_session(user)
    response = logout(expired(access), refresh)
    assert response.status_code == 204
    assert response.cookies[settings.REFRESH_COOKIE_NAME]["max-age"] == 0
    assert AuthSession.objects.get(user=user).revoked_at is not None


@pytest.mark.django_db
@pytest.mark.parametrize("same_owner", [True, False])
@pytest.mark.parametrize("access_is_expired", [True, False])
def test_logout_does_not_revoke_a_different_session_cookie(same_owner, access_is_expired):
    original = User.objects.create_user("first-logout@example.test")
    other = original if same_owner else User.objects.create_user("other-logout@example.test")
    access, _ = issue_session(original)
    other_access, other_refresh = issue_session(other)

    response = logout(expired(access) if access_is_expired else access, other_refresh)
    assert response.status_code == (401 if access_is_expired else 204)
    assert settings.REFRESH_COOKIE_NAME not in response.cookies
    assert AuthSession.objects.get(pk=AccessToken(other_access)["sid"]).revoked_at is None
    assert (AuthSession.objects.get(pk=AccessToken(access)["sid"]).revoked_at is None) is access_is_expired


@pytest.mark.django_db
def test_logout_valid_bearer_still_revokes_its_session_with_invalid_cookie():
    user = User.objects.create_user("logout-invalid-cookie@example.test")
    access, _ = issue_session(user)
    response = logout(access, "invalid-cookie")
    assert response.status_code == 204
    assert AuthSession.objects.get(user=user).revoked_at is not None


@pytest.mark.django_db
def test_logout_without_bearer_rejects_rotated_refresh_cookie_and_preserves_current_refresh():
    user = User.objects.create_user("logout-rotated-cookie@example.test")
    _, previous_refresh = issue_session(user)
    _, current_refresh = rotate_session(previous_refresh)

    response = logout(None, previous_refresh)

    assert response.status_code == 401
    assert settings.REFRESH_COOKIE_NAME not in response.cookies
    session = AuthSession.objects.get(user=user)
    assert session.revoked_at is None
    # The current cookie remains usable after the stale cookie was rejected.
    _, next_refresh = rotate_session(current_refresh)
    assert next_refresh


@pytest.mark.django_db
def test_logout_with_expired_access_and_rotated_refresh_does_not_revoke_session():
    user = User.objects.create_user("logout-rotated-expired@example.test")
    access, previous_refresh = issue_session(user)
    _, current_refresh = rotate_session(previous_refresh)

    response = logout(expired(access), previous_refresh)

    assert response.status_code == 401
    assert settings.REFRESH_COOKIE_NAME not in response.cookies
    session = AuthSession.objects.get(user=user)
    assert session.revoked_at is None
    # The current refresh still rotates successfully.
    _, next_refresh = rotate_session(current_refresh)
    assert next_refresh
