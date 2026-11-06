import pytest
from django.contrib import admin
from django.test import Client, RequestFactory
from rest_framework.test import APIClient

from accounts.models import OneTimeToken, User
from accounts.security import make_one_time_token


@pytest.mark.django_db
def test_stale_user_admin_edit_preserves_password_changed_by_reset_api():
    technical_admin = User.objects.create_superuser(
        "technical-admin@example.test", "Admin-Synthetic-Password-739!",
    )
    user = User.objects.create_user("account@example.test", "Original-Synthetic-Password-739!")
    stale = User.objects.get(pk=user.pk)
    stale.first_name = "Nombre actualizado"
    new_password = "Reset-Synthetic-Password-739!"

    token = make_one_time_token(user, OneTimeToken.Purpose.RESET)
    response = APIClient().post(
        "/api/v1/auth/reset-password/",
        {"token": token, "password": new_password},
        format="json",
    )
    assert response.status_code == 200, response.data

    user.refresh_from_db()
    assert user.check_password(new_password)

    request = RequestFactory().post(f"/admin/accounts/user/{user.pk}/change/")
    request.user = technical_admin
    admin.site._registry[User].save_model(request, stale, form=None, change=True)

    user.refresh_from_db()
    assert user.first_name == "Nombre actualizado"
    assert user.check_password(new_password)
    assert not user.check_password("Original-Synthetic-Password-739!")


@pytest.mark.django_db
def test_technical_admin_password_change_does_not_use_model_save_model(monkeypatch):
    technical_admin = User.objects.create_superuser(
        "technical-admin@example.test", "Admin-Synthetic-Password-739!",
    )
    user = User.objects.create_user("account@example.test", "Original-Synthetic-Password-739!")
    user_admin = admin.site._registry[User]

    def unexpected_save_model(*args, **kwargs):
        pytest.fail("La vista user_change_password no debe guardar mediante save_model")

    monkeypatch.setattr(user_admin, "save_model", unexpected_save_model)
    client = Client()
    client.force_login(technical_admin)
    new_password = "Technical-Synthetic-Password-739!"
    response = client.post(
        f"/admin/accounts/user/{user.pk}/password/",
        {"password1": new_password, "password2": new_password},
    )

    assert response.status_code == 302
    user.refresh_from_db()
    assert user.check_password(new_password)
