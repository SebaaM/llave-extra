import json
import re
import secrets
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from accounts.models import User
from providers.models import (
    Benefit,
    DemoSeedState,
    FolderProvider,
    Provider,
    ProviderMembership,
    Publication,
)
from referrals.models import CollaboratorProfile

DEMO_ACCOUNTS = [
    ("admin@llaveextra.test", User.Role.ADMIN),
    ("prestador.tiger@llaveextra.test", User.Role.PROVIDER),
    ("prestador.cumbre@llaveextra.test", User.Role.PROVIDER),
    ("colaborador@llaveextra.test", User.Role.COLLABORATOR),
    ("colaborador.secundario@llaveextra.test", User.Role.COLLABORATOR),
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
        existing_emails = set(User.objects.filter(email__in=[email for email, _ in DEMO_ACCOUNTS]).values_list("email", flat=True))
        missing_existing = sorted(existing_emails - credentials.keys())
        if missing_existing and not options["recover_missing"]:
            raise CommandError(
                "Faltan contraseñas demo preexistentes en el archivo local para: "
                + ", ".join(missing_existing)
                + ". No se creó ninguna cuenta ni se cambiaron contraseñas. "
                "Para rotarlas explícitamente, ejecutá seed_demo --recover-missing."
            )
        generated: dict[str, str] = {}
        with transaction.atomic():
            users = {}
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
                users[email] = user
            state, first_load = DemoSeedState.objects.get_or_create(key="historical-2026-10-15")
            if first_load:
                fixture_path = Path(__file__).resolve().parents[3] / "providers" / "fixtures" / "historical_demo.json"
                fixture = json.loads(fixture_path.read_text(encoding="utf-8-sig"))
                providers = {}
                published_demo = {"KUA001", "RDS002", "ALK003", "ANT007", "GLA001", "CAF001"}
                for entry in fixture["merchants"]:
                    legacy = entry["legacy_public_id"]
                    provider, _ = Provider.objects.get_or_create(
                        legacy_public_id=legacy,
                        defaults={"slug": slugify(entry["name"]), "name": entry["name"],
                                  "category": entry["category"] or "", "address": entry["address"] or "",
                                  "hours": entry["hours"] or "", "contact": entry["contact"] or "",
                                  "website": entry["website"] or "", "map_url": entry["map_url"] or "",
                                  "status": Publication.PUBLISHED if legacy in published_demo else Publication.DRAFT,
                                  "demo": True, "provenance": entry["provenance"] or ""},
                    )
                    providers[legacy] = provider
                    if legacy != "CUM001" and entry["benefit_text"]:
                        Benefit.objects.get_or_create(
                            provider=provider, title="Beneficio informado en fuente pública",
                            defaults={"conditions": entry["benefit_text"],
                                      "status": Publication.PUBLISHED if legacy in published_demo else Publication.DRAFT,
                                      "demo": True, "provenance": entry["provenance"] or ""},
                        )
                for email, legacy in (("prestador.tiger@llaveextra.test", "TIG001"),
                                      ("prestador.cumbre@llaveextra.test", "CUM001")):
                    if users[email].role == User.Role.PROVIDER:
                        ProviderMembership.objects.get_or_create(user=users[email], provider=providers[legacy])
                for email, assigned in (("colaborador@llaveextra.test", tuple(published_demo)),
                                        ("colaborador.secundario@llaveextra.test", ("TIG001", "KREN"))):
                    if users[email].role == User.Role.COLLABORATOR:
                        profile, _ = CollaboratorProfile.objects.get_or_create(user=users[email], defaults={"enabled": True})
                        for legacy in sorted(assigned):
                            FolderProvider.assign(profile.pk, providers[legacy].pk)

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

        self.stdout.write(self.style.SUCCESS("Seed demo completado; las cuentas existentes se conservaron."))
