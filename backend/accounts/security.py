import hashlib
import secrets
from datetime import timedelta

import redis
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, AuthenticationFailed, Throttled
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .authentication import password_fingerprint
from .models import AuthSession, OneTimeToken

RATE_SCRIPT = """local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n"""


class InvalidSession(APIException):
    status_code = 401
    default_detail = "Sesión inválida"


class InvalidOneTimeToken(APIException):
    status_code = 400
    default_detail = "Enlace inválido o vencido"


def rate_limit(scope: str, identity: str) -> None:
    limit, window = settings.RATE_LIMITS[scope]
    digest = hashlib.sha256(identity.encode()).hexdigest()
    key = f"rate:{scope}:{digest}"
    try:
        count = redis.Redis.from_url(settings.REDIS_URL).eval(RATE_SCRIPT, 1, key, window)
    except redis.RedisError:
        raise Throttled(detail="Control de intentos temporalmente no disponible") from None
    if count > limit:
        raise Throttled(wait=window)


def issue_session(user):
    if not user.is_active:
        raise AuthenticationFailed("Credenciales inválidas")
    session = AuthSession.objects.create(user=user, refresh_jti_hash="")
    refresh = RefreshToken.for_user(user)
    refresh["sid"] = str(session.id)
    refresh["pwd"] = password_fingerprint(user.password)
    session.refresh_jti_hash = hashlib.sha256(refresh["jti"].encode()).hexdigest()
    session.save(update_fields=["refresh_jti_hash"])
    return str(refresh.access_token), str(refresh)


def rotate_session(raw_token: str):
    try:
        old = RefreshToken(raw_token)
        sid = old["sid"]
        user_id = old["user_id"]
    except (TokenError, KeyError, ValueError):
        raise InvalidSession() from None
    with transaction.atomic():
        session = AuthSession.objects.select_for_update().select_related("user").filter(id=sid).first()
        if (session is None or session.revoked_at or str(session.user_id) != str(user_id)
                or not session.user.is_active
                or old.get("pwd") != password_fingerprint(session.user.password)
                or session.refresh_jti_hash != hashlib.sha256(old["jti"].encode()).hexdigest()):
            raise InvalidSession()
        refresh = RefreshToken.for_user(session.user)
        refresh["sid"] = str(session.id)
        refresh["pwd"] = password_fingerprint(session.user.password)
        session.refresh_jti_hash = hashlib.sha256(refresh["jti"].encode()).hexdigest()
        session.save(update_fields=["refresh_jti_hash"])
        return str(refresh.access_token), str(refresh)


def revoke_session(raw_token: str) -> None:
    try:
        old = RefreshToken(raw_token)
        sid = old["sid"]
    except (TokenError, KeyError, ValueError):
        return
    AuthSession.objects.filter(id=sid, user_id=old["user_id"]).update(revoked_at=timezone.now())


def make_one_time_token(user, purpose: str) -> str:
    raw = secrets.token_urlsafe(32)
    OneTimeToken.objects.create(
        user=user, purpose=purpose, token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=timezone.now() + timedelta(hours=24 if purpose == OneTimeToken.Purpose.VERIFY else 1),
    )
    return raw


def consume_one_time_token(raw: str, purpose: str):
    digest = hashlib.sha256(raw.encode()).hexdigest()
    token = OneTimeToken.objects.select_for_update().select_related("user").filter(
        token_hash=digest, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now(),
    ).first()
    if token is None or not token.user.is_active:
        raise InvalidOneTimeToken()
    token.used_at = timezone.now()
    token.save(update_fields=["used_at"])
    return token.user


def send_token_email(user, purpose: str, raw: str) -> None:
    subject = "Verificá tu email" if purpose == OneTimeToken.Purpose.VERIFY else "Restablecé tu contraseña"
    path = "verificar-email" if purpose == OneTimeToken.Purpose.VERIFY else "restablecer-clave"
    # El enlace usa fragmento para no registrar el token en el servidor web.
    url = f"{settings.PUBLIC_APP_URL}/{path}#token={raw}"
    sent = send_mail(subject, f"Abrí este enlace: {url}", settings.DEFAULT_FROM_EMAIL, [user.email])
    if sent != 1:
        raise RuntimeError("SMTP no confirmó el envío")
