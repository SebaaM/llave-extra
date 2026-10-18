import re
import secrets
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from referrals.models import CollaboratorProfile

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

    def add_arguments(self, parser):
        parser.add_argument(
            "--recover-missing",
            action="store_true",
            help="Rota contraseñas demo existentes cuando faltan del archivo local de credenciales.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo solo puede ejecutarse con DEBUG habilitado")
        destination = Path(settings.DEMO_CREDENTIALS_PATH)
        content = destination.read_text(encoding="utf-8") if destination.exists() else ""
        credentials = {
            email: password
            for email, password in re.findall(
                r"^- `([^`]+)` — contraseña: `([^`]+)`\s*$", content, flags=re.MULTILINE
            )
        }
        generated: dict[str, str] = {}
        unresolved: list[str] = []
        for email, role in DEMO_ACCOUNTS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={"role": role, "is_staff": role == User.Role.ADMIN,
                          "is_superuser": role == User.Role.ADMIN, "email_verified": role != User.Role.TOURIST or email == "turista@llaveextra.test"},
            )
            if created or (options["recover_missing"] and email not in credentials):
                password = secrets.token_urlsafe(18)
                user.set_password(password)
                user.save(update_fields=["password"])
                generated[email] = password
            elif email not in credentials:
                unresolved.append(email)
            if role == User.Role.COLLABORATOR and user.role == User.Role.COLLABORATOR:
                CollaboratorProfile.objects.get_or_create(user=user, defaults={"enabled": True})

        if generated:
            destination.parent.mkdir(parents=True, exist_ok=True)
            lines = content.splitlines() if content else [
                "# Cuentas locales de prueba",
                "",
                "Solo para desarrollo local. No subir este archivo.",
                "",
            ]
            generated_lines = {
                email: f"- `{email}` — contraseña: `{password}`"
                for email, password in generated.items()
            }
            found: set[str] = set()
            for index, line in enumerate(lines):
                match = re.match(r"^- `([^`]+)` — contraseña:", line)
                if match and match.group(1) in generated_lines:
                    email = match.group(1)
                    lines[index] = generated_lines[email]
                    found.add(email)
            lines.extend(generated_lines[email] for email in generated if email not in found)
            destination.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
            self.stdout.write(f"Credenciales nuevas guardadas en {destination.name}.")

        if unresolved:
            missing = ", ".join(unresolved)
            raise CommandError(
                "Faltan contraseñas demo en el archivo local para: "
                f"{missing}. No se cambiaron esas contraseñas. "
                "Si querés rotarlas de forma explícita, ejecutá seed_demo --recover-missing."
            )
        self.stdout.write(self.style.SUCCESS("Seed demo completado; las cuentas existentes se conservaron."))
