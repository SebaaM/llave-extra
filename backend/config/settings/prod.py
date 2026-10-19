from os import environ

from .base import *  # noqa: F403

if not SECRET_KEY:  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY es obligatorio en producción")
if len(SECRET_KEY) < 50:  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY debe tener al menos 50 caracteres")
if not environ.get("DJANGO_ALLOWED_HOSTS", "").strip():
    raise RuntimeError("DJANGO_ALLOWED_HOSTS es obligatorio en producción")
if len(JWT_SIGNING_KEY) < 50 or len(QR_SIGNING_KEY) < 50:  # noqa: F405
    raise RuntimeError("JWT_SIGNING_KEY y QR_SIGNING_KEY deben tener al menos 50 caracteres")
if JWT_SIGNING_KEY == SECRET_KEY or QR_SIGNING_KEY in (SECRET_KEY, JWT_SIGNING_KEY):  # noqa: F405
    raise RuntimeError("Las claves Django, JWT y QR deben ser independientes")
DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
REFRESH_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
