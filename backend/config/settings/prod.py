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
if SHOP_PAYMENT_PROVIDER == "fake":  # noqa: F405
    raise RuntimeError("El simulador de pagos no está permitido en producción")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
REFRESH_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000

# Nginx sustituye esta cabecera antes de pasar solicitudes a Django.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
EMAIL_HOST = environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = environ.get("EMAIL_USE_TLS", "true").lower() == "true"
EMAIL_USE_SSL = environ.get("EMAIL_USE_SSL", "false").lower() == "true"
