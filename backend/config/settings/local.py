from .base import *  # noqa: F403

DEBUG = True
if not SECRET_KEY:  # noqa: F405
    raise RuntimeError("Ejecutá el script de desarrollo para inicializar DJANGO_SECRET_KEY")
EMAIL_HOST = os.environ.get("MAILPIT_HOST", "mailpit")  # noqa: F405
EMAIL_PORT = int(os.environ.get("MAILPIT_PORT", "1025"))  # noqa: F405
