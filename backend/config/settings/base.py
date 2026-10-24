import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
DEBUG = False
ALLOWED_HOSTS = [host for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if host]
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework", "drf_spectacular", "accounts", "referrals", "providers", "credits", "shop", "administration",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware",
    "config.security_headers.PrivateAPIHeadersMiddleware",
    "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
              "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "NAME": os.environ.get("POSTGRES_DB", "llaveextra"),
             "USER": os.environ.get("POSTGRES_USER", "llaveextra"), "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
             "HOST": os.environ.get("POSTGRES_HOST", "db"), "PORT": os.environ.get("POSTGRES_PORT", "5432"),
             "CONN_MAX_AGE": 60}}
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Ushuaia"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
PRIVATE_MEDIA_ROOT = BASE_DIR / "private_media"
DEMO_CREDENTIALS_PATH = Path(os.environ.get("DEMO_CREDENTIALS_PATH", BASE_DIR.parent / "docs" / "cuentas-prueba.local.md"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.SessionJWTAuthentication"],
}
SPECTACULAR_SETTINGS = {"TITLE": "Llave Extra API", "DESCRIPTION": "API versionada de Llave Extra.", "VERSION": "1.0.0"}
JWT_SIGNING_KEY = os.environ.get("JWT_SIGNING_KEY", "")
QR_SIGNING_KEY = os.environ.get("QR_SIGNING_KEY", "")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "http://localhost:5173").rstrip("/")
TRUSTED_PROXY_HOST = os.environ.get("TRUSTED_PROXY_HOST", "")


def positive_env(name: str, default: int) -> int:
    value = int(os.environ.get(name, str(default)))
    if value < 1:
        raise RuntimeError(f"{name} debe ser mayor que cero")
    return value


RATE_LIMITS = {
    "login": (positive_env("RATE_LOGIN_MAX", 10), positive_env("RATE_LOGIN_WINDOW", 300)),
    "reset": (positive_env("RATE_RESET_MAX", 5), positive_env("RATE_RESET_WINDOW", 3600)),
    "resend": (positive_env("RATE_RESEND_MAX", 5), positive_env("RATE_RESEND_WINDOW", 3600)),
    "redeem": (positive_env("RATE_REDEEM_MAX", 20), positive_env("RATE_REDEEM_WINDOW", 300)),
    "consumption": (positive_env("RATE_CONSUMPTION_MAX", 8), positive_env("RATE_CONSUMPTION_WINDOW", 300)),
}
RATE_LIMITS["reset_submit"] = RATE_LIMITS["reset"]
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ALGORITHM": "HS256", "SIGNING_KEY": JWT_SIGNING_KEY,
    "AUDIENCE": "llave-extra-api", "ISSUER": "llave-extra",
    "AUTH_HEADER_TYPES": ("Bearer",),
}
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@llaveextra.local")
EMAIL_HOST = os.environ.get("MAILPIT_HOST", "mailpit")
EMAIL_PORT = int(os.environ.get("MAILPIT_PORT", "1025"))
REFRESH_COOKIE_NAME = "llave_refresh"
REFRESH_COOKIE_SECURE = not DEBUG
REFRESH_COOKIE_SAMESITE = "Lax"
SHOP_PAYMENT_PROVIDER = os.environ.get("SHOP_PAYMENT_PROVIDER", "disabled") or "disabled"
if SHOP_PAYMENT_PROVIDER not in {"disabled", "fake", "mercadopago"}:
    raise RuntimeError("SHOP_PAYMENT_PROVIDER inválido")
SHOP_MP_ACCESS_TOKEN = os.environ.get("SHOP_MP_ACCESS_TOKEN", "")
SHOP_MP_SELLER_ID = os.environ.get("SHOP_MP_SELLER_ID", "")
SHOP_MP_WEBHOOK_SECRET = os.environ.get("SHOP_MP_WEBHOOK_SECRET", "")
SHOP_MP_SANDBOX_VERIFIED = os.environ.get("SHOP_MP_SANDBOX_VERIFIED", "") == "true"
