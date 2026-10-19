from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Usuarios y acceso"

    def ready(self):
        from . import schema  # noqa: F401
