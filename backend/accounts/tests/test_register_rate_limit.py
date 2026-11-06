import pytest
import redis
from django.core import mail
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import OneTimeToken, User

PASSWORD = "Test-Password-789!"


def browser():
    client = APIClient(enforce_csrf_checks=True)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    client.credentials(HTTP_X_CSRFTOKEN=response.data["csrfToken"])
    return client


def register(client, email, **headers):
    return client.post(
        "/api/v1/auth/register/",
        {"email": email, "password": PASSWORD},
        format="json",
        **headers,
    )


@pytest.mark.django_db
def test_register_rate_limit_is_shared_by_origin_across_emails():
    client = browser()
    with override_settings(RATE_LIMITS={"register": (2, 60)}):
        assert register(client, "origin-1@example.test", REMOTE_ADDR="198.51.100.44").status_code == 201
        assert register(client, "origin-2@example.test", REMOTE_ADDR="198.51.100.44").status_code == 201
        limited = register(client, "origin-3@example.test", REMOTE_ADDR="198.51.100.44")

    assert limited.status_code == 429
    assert User.objects.count() == 2
    assert OneTimeToken.objects.count() == 2
    assert len(mail.outbox) == 2


@pytest.mark.django_db
def test_register_rate_limit_is_shared_by_email_across_origins():
    client = browser()
    with override_settings(RATE_LIMITS={"register": (1, 60)}):
        assert register(client, "same@example.test", REMOTE_ADDR="198.51.100.51").status_code == 201
        limited = register(client, "SAME@example.test", REMOTE_ADDR="198.51.100.52")

    assert limited.status_code == 429
    assert User.objects.count() == 1
    assert OneTimeToken.objects.count() == 1
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_register_fails_closed_on_redis_failure_without_writes_or_email(monkeypatch):
    def unavailable(*args, **kwargs):
        raise redis.ConnectionError("offline")

    monkeypatch.setattr(redis.Redis, "eval", unavailable)
    response = register(browser(), "offline@example.test", REMOTE_ADDR="198.51.100.61")

    assert response.status_code == 429
    assert not User.objects.exists()
    assert not OneTimeToken.objects.exists()
    assert not mail.outbox


@pytest.mark.django_db
def test_register_with_available_quota_creates_account_token_and_email():
    with override_settings(RATE_LIMITS={"register": (1, 60)}):
        response = register(browser(), "allowed@example.test", REMOTE_ADDR="198.51.100.71")

    assert response.status_code == 201
    user = User.objects.get(email="allowed@example.test")
    assert user.role == User.Role.TOURIST
    assert not user.email_verified
    assert OneTimeToken.objects.filter(user=user, purpose=OneTimeToken.Purpose.VERIFY).count() == 1
    assert len(mail.outbox) == 1
