from .base import *  # noqa: F403

if not SECRET_KEY:  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY es obligatorio en producción")
if len(SECRET_KEY) < 50:  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY debe tener al menos 50 caracteres")
if not ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("DJANGO_ALLOWED_HOSTS es obligatorio en producción")
DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
