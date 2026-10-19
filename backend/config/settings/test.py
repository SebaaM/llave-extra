from urllib.parse import urlsplit, urlunsplit

from .base import *  # noqa: F403

SECRET_KEY = "test-only-secret-key"
JWT_SIGNING_KEY = "test-only-jwt-signing-key-separate-from-django"
QR_SIGNING_KEY = "test-only-qr-signing-key-separate-from-jwt"
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
SIMPLE_JWT["SIGNING_KEY"] = JWT_SIGNING_KEY  # noqa: F405
_redis_parts = urlsplit(REDIS_URL)  # noqa: F405
REDIS_URL = urlunsplit((_redis_parts.scheme, _redis_parts.netloc, "/1", "", ""))
