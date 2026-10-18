from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from urllib.parse import urlsplit

import pytest
import redis
from django.conf import settings
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import Throttled
from rest_framework.test import APIClient

from accounts.models import AuthSession, OneTimeToken, User
from accounts.security import InvalidSession, issue_session, rate_limit, rotate_session

PASSWORD = "Test-Password-789!"


def browser():
    client = APIClient(enforce_csrf_checks=True)
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200, response.data
    client.credentials(HTTP_X_CSRFTOKEN=response.data["csrfToken"])
    return client


def emailed_token():
    return urlsplit(mail.outbox[-1].body.split("Abrí este enlace: ", 1)[1].strip()).fragment.split("=", 1)[1]


@pytest.mark.django_db
def test_register_rejects_privilege_fields_and_normalizes_email():
    client = browser()
    response = client.post("/api/v1/auth/register/", {
        "email": " TOURIST@Example.Test ", "password": PASSWORD, "role": "ADMIN",
        "is_staff": True, "email_verified": True,
    }, format="json")
    assert response.status_code == 400
    assert User.objects.count() == 0
    response = client.post("/api/v1/auth/register/", {"email": "TOURIST@Example.Test", "password": PASSWORD}, format="json")
    assert response.status_code == 201
    user = User.objects.get()
    assert (user.email, user.role, user.email_verified, user.is_staff) == ("tourist@example.test", "TOURIST", False, False)
    duplicate = client.post("/api/v1/auth/register/", {"email": "Tourist@example.test", "password": PASSWORD}, format="json")
    assert duplicate.status_code == 400


@pytest.mark.django_db
def test_csrf_login_cookie_refresh_logout_and_revoked_access():
    user = User.objects.create_user("tourist@example.test", PASSWORD)
    csrf_client = APIClient(enforce_csrf_checks=True)
    assert csrf_client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json").status_code == 403
    client = browser()
    response = client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.data
    cookie = response.cookies[settings.REFRESH_COOKIE_NAME]
    assert cookie["httponly"] and cookie["samesite"] == "Lax"
    access = response.data["access"]
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert bearer.get("/api/v1/auth/me/").status_code == 200
    old_refresh = cookie.value
    import hashlib

    from rest_framework_simplejwt.tokens import RefreshToken

    from accounts.authentication import password_fingerprint
    old = RefreshToken(old_refresh)
    session = AuthSession.objects.get(user=user)
    assert str(session.id) == old["sid"]
    assert str(session.user_id) == old["user_id"]
    assert old["pwd"] == password_fingerprint(user.password)
    assert session.refresh_jti_hash == hashlib.sha256(old["jti"].encode()).hexdigest()
    assert client.cookies[settings.REFRESH_COOKIE_NAME].value == old_refresh
    no_csrf_refresh = APIClient(enforce_csrf_checks=True)
    no_csrf_refresh.cookies[settings.REFRESH_COOKIE_NAME] = old_refresh
    assert no_csrf_refresh.post("/api/v1/auth/refresh/").status_code == 403
    response = client.post("/api/v1/auth/refresh/")
    assert response.status_code == 200, response.data
    client.cookies[settings.REFRESH_COOKIE_NAME] = old_refresh
    assert client.post("/api/v1/auth/refresh/").status_code == 401
    client.cookies[settings.REFRESH_COOKIE_NAME] = response.cookies[settings.REFRESH_COOKIE_NAME].value
    no_csrf = APIClient(enforce_csrf_checks=True)
    no_csrf.cookies[settings.REFRESH_COOKIE_NAME] = response.cookies[settings.REFRESH_COOKIE_NAME].value
    assert no_csrf.post("/api/v1/auth/logout/").status_code == 403
    assert client.post("/api/v1/auth/logout/").status_code == 204
    assert bearer.get("/api/v1/auth/me/").status_code == 401
    assert AuthSession.objects.get(user=user).revoked_at is not None


@pytest.mark.django_db
def test_inactive_login_and_password_change_revoke_access():
    user = User.objects.create_user("tourist@example.test", PASSWORD)
    client = browser()
    response = client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    user.set_password("New-Password-789!")
    user.save(update_fields=["password"])
    assert bearer.get("/api/v1/auth/me/").status_code == 401
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert client.post("/api/v1/auth/login/", {"email": user.email, "password": "New-Password-789!"}, format="json").status_code == 401


@pytest.mark.django_db
def test_logout_with_bearer_revokes_when_refresh_cookie_is_missing():
    user = User.objects.create_user("bearer@example.test", PASSWORD)
    access, _ = issue_session(user)
    client = browser()
    client.credentials(HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value, HTTP_AUTHORIZATION=f"Bearer {access}")
    assert client.post("/api/v1/auth/logout/").status_code == 204
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert bearer.get("/api/v1/auth/me/").status_code == 401


@pytest.mark.django_db
def test_email_verification_and_reset_are_one_use_and_expiring():
    client = browser()
    client.post("/api/v1/auth/register/", {"email": "tourist@example.test", "password": PASSWORD}, format="json")
    verify = emailed_token()
    OneTimeToken.objects.filter(purpose="VERIFY").update(expires_at=timezone.now())
    assert client.post("/api/v1/auth/verify-email/", {"token": verify}, format="json").status_code == 400
    client.post("/api/v1/auth/resend-verification/", {"email": "tourist@example.test"}, format="json")
    verify = emailed_token()
    assert client.post("/api/v1/auth/verify-email/", {"token": verify}, format="json").status_code == 200
    assert client.post("/api/v1/auth/verify-email/", {"token": verify}, format="json").status_code == 400
    user = User.objects.get()
    assert user.email_verified
    login = client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
    assert login.status_code == 200
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    assert client.post("/api/v1/auth/forgot-password/", {"email": user.email}, format="json").status_code == 202
    reset = emailed_token()
    OneTimeToken.objects.filter(purpose="RESET").update(expires_at=timezone.now())
    assert client.post("/api/v1/auth/reset-password/", {"token": reset, "password": "New-Password-789!"}, format="json").status_code == 400
    client.post("/api/v1/auth/forgot-password/", {"email": user.email}, format="json")
    reset = emailed_token()
    client.post("/api/v1/auth/forgot-password/", {"email": user.email}, format="json")
    newer_reset = emailed_token()
    assert client.post("/api/v1/auth/reset-password/", {"token": newer_reset, "password": "New-Password-789!"}, format="json").status_code == 200
    assert client.post("/api/v1/auth/reset-password/", {"token": newer_reset, "password": "Another-Password-789!"}, format="json").status_code == 400
    assert client.post("/api/v1/auth/reset-password/", {"token": reset, "password": "Another-Password-789!"}, format="json").status_code == 400
    assert bearer.get("/api/v1/auth/me/").status_code == 401
    assert client.post("/api/v1/auth/refresh/").status_code == 401


@pytest.mark.django_db
def test_generic_account_recovery_responses():
    client = browser()
    User.objects.create_user("known@example.test", PASSWORD)
    for path in ("forgot-password", "resend-verification"):
        known = client.post(f"/api/v1/auth/{path}/", {"email": "known@example.test"}, format="json")
        unknown = client.post(f"/api/v1/auth/{path}/", {"email": "missing@example.test"}, format="json")
        assert known.status_code == unknown.status_code == 202
        assert known.data == unknown.data


@pytest.mark.django_db
def test_shared_redis_rate_limit():
    with override_settings(RATE_LIMITS={"login": (2, 60)}):
        rate_limit("login", "unique-test-redis-key")
        rate_limit("login", "unique-test-redis-key")
        with pytest.raises(Throttled):
            rate_limit("login", "unique-test-redis-key")


@pytest.mark.django_db
@pytest.mark.parametrize("operation,expected", [
    ("login", 401), ("forgot-password", 202), ("resend-verification", 202),
])
def test_auth_rate_limit_is_shared_by_origin_when_emails_change(operation, expected):
    client = browser()
    with override_settings(RATE_LIMITS={"login": (2, 60), "reset": (2, 60), "resend": (2, 60)}):
        for index in range(2):
            response = client.post(
                f"/api/v1/auth/{operation}/",
                {"email": f"vary-{index}@example.test", **({"password": PASSWORD} if operation == "login" else {})},
                format="json", REMOTE_ADDR="198.51.100.10",
            )
            assert response.status_code == expected
        limited = client.post(
            f"/api/v1/auth/{operation}/",
            {"email": "vary-2@example.test", **({"password": PASSWORD} if operation == "login" else {})},
            format="json", REMOTE_ADDR="198.51.100.10",
        )
        assert limited.status_code == 429


@pytest.mark.django_db
@pytest.mark.parametrize("operation,expected", [
    ("login", 401), ("forgot-password", 202), ("resend-verification", 202),
])
def test_auth_rate_limit_is_shared_by_account_across_origins(operation, expected):
    client = browser()
    with override_settings(RATE_LIMITS={"login": (2, 60), "reset": (2, 60), "resend": (2, 60)}):
        for index in range(2):
            response = client.post(
                f"/api/v1/auth/{operation}/",
                {"email": "target@example.test", **({"password": PASSWORD} if operation == "login" else {})},
                format="json", REMOTE_ADDR=f"198.51.100.{index + 1}",
            )
            assert response.status_code == expected
        limited = client.post(
            f"/api/v1/auth/{operation}/",
            {"email": "target@example.test", **({"password": PASSWORD} if operation == "login" else {})},
            format="json", REMOTE_ADDR="198.51.100.3",
        )
        assert limited.status_code == 429


@pytest.mark.django_db
def test_redis_limit_is_atomic_across_connections():
    with override_settings(RATE_LIMITS={"login": (1, 60)}):
        def attempt(_):
            try:
                rate_limit("login", "atomic-redis-key")
                return "ok"
            except Throttled:
                return "limited"

        with ThreadPoolExecutor(max_workers=8) as pool:
            assert sorted(pool.map(attempt, range(8))) == ["limited"] * 7 + ["ok"]


@pytest.mark.django_db
def test_redis_failure_closes_limiter(monkeypatch):
    def unavailable(*args, **kwargs):
        raise redis.ConnectionError("offline")

    monkeypatch.setattr(redis.Redis, "eval", unavailable)
    with pytest.raises(Throttled, match="no disponible"):
        rate_limit("login", "other-unique-key")


@pytest.mark.django_db(transaction=True)
def test_refresh_race_has_one_successful_continuation():
    user = User.objects.create_user("race@example.test", PASSWORD)
    _, raw = issue_session(user)
    barrier = Barrier(2)

    def attempt(_):
        try:
            barrier.wait()
            rotate_session(raw)
            return "ok"
        except InvalidSession:
            return "invalid"
        finally:
            from django.db import connections
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == ["invalid", "ok"]
    assert AuthSession.objects.filter(user=user, revoked_at__isnull=True).count() == 1
