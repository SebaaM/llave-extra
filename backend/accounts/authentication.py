import hashlib
import hmac

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import AuthSession


def password_fingerprint(password_hash: str) -> str:
    return hmac.new(settings.JWT_SIGNING_KEY.encode(), password_hash.encode(), hashlib.sha256).hexdigest()


class SessionJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        sid = validated_token.get("sid")
        if not sid or validated_token.get("pwd") != password_fingerprint(user.password):
            raise AuthenticationFailed("Sesión inválida")
        if not AuthSession.objects.filter(id=sid, user=user, revoked_at__isnull=True).exists():
            raise AuthenticationFailed("Sesión inválida")
        return user
