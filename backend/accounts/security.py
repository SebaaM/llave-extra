import hashlib
import secrets
from datetime import timedelta
from uuid import UUID

import redis
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, AuthenticationFailed, Throttled
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .authentication import password_fingerprint
from .models import AuthSession, OneTimeToken, User

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


def _locked_current_refresh_session(old):
    """Lock User then AuthSession, matching password reset/admin lock order."""
    try:
        sid = str(UUID(str(old["sid"])))
        user_id = int(old["user_id"])
        token_jti = old["jti"]
    except (KeyError, TypeError, ValueError):
        return None
    if type(token_jti) is not str or not token_jti:
        return None
    user = User.objects.select_for_update().filter(pk=user_id).first()
    if user is None:
        return None
    session = AuthSession.objects.select_for_update().filter(id=sid, user_id=user.pk).first()
    if (session is None or session.revoked_at or not user.is_active
            or old.get("pwd") != password_fingerprint(user.password)
            or session.refresh_jti_hash != hashlib.sha256(token_jti.encode()).hexdigest()):
        return None
    return session, user


def rotate_session(raw_token: str):
    try:
        old = RefreshToken(raw_token)
    except TokenError:
        raise InvalidSession() from None
    with transaction.atomic():
        locked = _locked_current_refresh_session(old)
        if locked is None:
            raise InvalidSession()
        session, user = locked
        refresh = RefreshToken.for_user(user)
        refresh["sid"] = str(session.id)
        refresh["pwd"] = password_fingerprint(user.password)
        session.refresh_jti_hash = hashlib.sha256(refresh["jti"].encode()).hexdigest()
        session.save(update_fields=["refresh_jti_hash"])
        return str(refresh.access_token), str(refresh)


def revoke_refresh_session(raw_token: str) -> bool:
    """Revoke only when this signed refresh token is still the session's current one."""
    try:
        refresh = RefreshToken(raw_token)
    except TokenError:
        return False
    with transaction.atomic():
        locked = _locked_current_refresh_session(refresh)
        if locked is None:
            return False
        session, _user = locked
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        return True


def logout_token_identity(raw_token, token_class, *, verify=True):
    if not raw_token:
        return None
    try:
        token = token_class(raw_token, verify=verify)
        user_id = token["user_id"]
        if token.get("token_type") != token_class.token_type or type(user_id) not in (int, str):
            return None
        return str(UUID(str(token["sid"]))), str(int(user_id))
    except (TokenError, KeyError, TypeError, ValueError):
        return None


def revoke_session(sid: str, user_id: str) -> None:
    AuthSession.objects.filter(id=sid, user_id=user_id, revoked_at__isnull=True).update(revoked_at=timezone.now())


def make_one_time_token(user, purpose: str) -> str:
    with transaction.atomic():
        current = User.objects.select_for_update().filter(pk=user.pk, email=user.email, is_active=True).first()
        if current is None:
            raise InvalidOneTimeToken()
        raw = secrets.token_urlsafe(32)
        OneTimeToken.objects.create(
            user=current, purpose=purpose, token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            expires_at=timezone.now() + timedelta(hours=24 if purpose == OneTimeToken.Purpose.VERIFY else 1),
        )
    return raw


def consume_one_time_token(raw: str, purpose: str):
    digest = hashlib.sha256(raw.encode()).hexdigest()
    pending = OneTimeToken.objects.filter(token_hash=digest, purpose=purpose, used_at__isnull=True)
    user_id = pending.filter(expires_at__gt=timezone.now()).values_list("user_id", flat=True).first()
    if user_id is None:
        raise InvalidOneTimeToken()
    user = User.objects.select_for_update().filter(pk=user_id, is_active=True).first()
    if user is None:
        raise InvalidOneTimeToken()
    token = pending.select_for_update().filter(user=user, expires_at__gt=timezone.now()).first()
    if token is None:
        raise InvalidOneTimeToken()
    token.used_at = timezone.now()
    token.save(update_fields=["used_at"])
    return user


def send_token_email(user, purpose: str, raw: str) -> None:
    subject = "Verificá tu email" if purpose == OneTimeToken.Purpose.VERIFY else "Restablecé tu contraseña"
    path = "verificar-email" if purpose == OneTimeToken.Purpose.VERIFY else "restablecer-clave"
    # El enlace usa fragmento para no registrar el token en el servidor web.
    url = f"{settings.PUBLIC_APP_URL}/{path}#token={raw}"
    sent = send_mail(subject, f"Abrí este enlace: {url}", settings.DEFAULT_FROM_EMAIL, [user.email])
    if sent != 1:
        raise RuntimeError("SMTP no confirmó el envío")
