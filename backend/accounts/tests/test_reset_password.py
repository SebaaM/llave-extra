import pytest
from rest_framework.test import APIClient

from accounts.models import OneTimeToken, User
from accounts.security import make_one_time_token


@pytest.mark.django_db
def test_reset_rejects_password_similar_to_email_and_preserves_token():
    user = User.objects.create_user("client-security@example.test", "Old-Audit-Password-239!")
    original_password = user.password
    token = make_one_time_token(user, OneTimeToken.Purpose.RESET)
    client = APIClient(enforce_csrf_checks=True)
    csrf = client.get("/api/v1/auth/csrf/").data["csrfToken"]
    client.credentials(HTTP_X_CSRFTOKEN=csrf)
    url = "/api/v1/auth/reset-password/"

    response = client.post(url, {"token": token, "password": user.email}, format="json")
    assert response.status_code == 400
    assert set(response.data) == {"password"}
    user.refresh_from_db()
    assert user.password == original_password
    assert OneTimeToken.objects.get(user=user).used_at is None

    response = client.post(url, {"token": token, "password": "New-Audit-Password-302!"}, format="json")
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("New-Audit-Password-302!")
