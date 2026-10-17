import secrets
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User

DEMO_ACCOUNTS = [
    ("admin@llaveextra.test", User.Role.ADMIN),
    ("prestador.tiger@llaveextra.test", User.Role.PROVIDER),
    ("prestador.cumbre@llaveextra.test", User.Role.PROVIDER),
    ("colaborador@llaveextra.test", User.Role.COLLABORATOR),
    ("turista@llaveextra.test", User.Role.TOURIST),
    ("turista.pendiente@llaveextra.test", User.Role.TOURIST),
]


class Command(BaseCommand):
    help = "Crea las cuentas de acceso demo locales sin modificar cuentas existentes."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo solo puede ejecutarse con DEBUG habilitado")
        credentials = []
        for email, role in DEMO_ACCOUNTS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={"role": role, "is_staff": role == User.Role.ADMIN,
                          "is_superuser": role == User.Role.ADMIN, "email_verified": role != User.Role.TOURIST or email == "turista@llaveextra.test"},
            )
            if created:
                password = secrets.token_urlsafe(18)
                user.set_password(password)
                user.save(update_fields=["password"])
                credentials.append((email, password))
        if credentials:
            destination = Path(settings.DEMO_CREDENTIALS_PATH)
            destination.parent.mkdir(parents=True, exist_ok=True)
            lines = ["# Cuentas locales de prueba", "", "Solo para desarrollo local. No subir este archivo.", ""]
            lines.extend(f"- `{email}` — contraseña: `{password}`" for email, password in credentials)
            destination.write_text("\n".join(lines) + "\n", encoding="utf-8")
            self.stdout.write(f"Credenciales nuevas guardadas en {destination.name}.")
        self.stdout.write(self.style.SUCCESS("Seed demo completado; las cuentas existentes se conservaron."))
