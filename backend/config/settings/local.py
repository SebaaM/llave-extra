from .base import *  # noqa: F403

DEBUG = True
if not SECRET_KEY:  # noqa: F405
    raise RuntimeError("Ejecutá el script de desarrollo para inicializar DJANGO_SECRET_KEY")
if not ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("Ejecutá el script de desarrollo para inicializar DJANGO_ALLOWED_HOSTS")
EMAIL_HOST = os.environ.get("MAILPIT_HOST", "mailpit")  # noqa: F405
EMAIL_PORT = int(os.environ.get("MAILPIT_PORT", "1025"))  # noqa: F405
if not JWT_SIGNING_KEY or not QR_SIGNING_KEY:  # noqa: F405
    raise RuntimeError("Ejecutá el script de desarrollo para inicializar JWT_SIGNING_KEY y QR_SIGNING_KEY")
REFRESH_COOKIE_SECURE = False
