import pytest
from django.test import Client
from rest_framework.test import APIClient

from accounts.models import OneTimeToken, User
from accounts.security import InvalidOneTimeToken, issue_session, make_one_time_token


@pytest.mark.django_db
def test_changing_email_in_technical_admin_invalidates_previous_links_and_session():
    admin = User.objects.create_superuser("audit-admin@example.test", "Synthetic-Admin-Password-12!")
    user = User.objects.create_user("previous-address@example.test", "Synthetic-Account-Password-12!", email_verified=True)
    access, _ = issue_session(user)
    verify = make_one_time_token(user, OneTimeToken.Purpose.VERIFY)
    reset = make_one_time_token(user, OneTimeToken.Purpose.RESET)
    stale_user = User.objects.get(pk=user.pk)
    previous_password = user.password

    technical_admin = Client(enforce_csrf_checks=True)
    technical_admin.force_login(admin)
    path = f"/admin/accounts/user/{user.pk}/change/"
    assert technical_admin.get(path).status_code == 200
    response = technical_admin.post(path, {
        "email": "current-address@example.test",
        "role": user.role,
        "is_active": "on",
        "email_verified": "on",
        "_save": "Guardar",
    }, HTTP_X_CSRFTOKEN=technical_admin.cookies["csrftoken"].value)
    assert response.status_code == 302
    user.refresh_from_db()
    assert user.email == "current-address@example.test"
    assert not user.email_verified

    with pytest.raises(InvalidOneTimeToken):
        make_one_time_token(stale_user, OneTimeToken.Purpose.VERIFY)

    browser = APIClient(enforce_csrf_checks=True)
    csrf = browser.get("/api/v1/auth/csrf/").data["csrfToken"]
    browser.credentials(HTTP_X_CSRFTOKEN=csrf)
    assert browser.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}").status_code == 401
    assert browser.post("/api/v1/auth/verify-email/", {"token": verify}, format="json").status_code == 400
    assert browser.post("/api/v1/auth/reset-password/", {
        "token": reset, "password": "Different-Synthetic-Password-39!",
    }, format="json").status_code == 400
    user.refresh_from_db()
    assert not user.email_verified
    assert user.password == previous_password

    new_token = make_one_time_token(user, OneTimeToken.Purpose.VERIFY)
    assert browser.post("/api/v1/auth/verify-email/", {"token": new_token}, format="json").status_code == 200
    user.refresh_from_db()
    assert user.email_verified
