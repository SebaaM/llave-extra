"""Attach approved local media to empty fields on historical demo records."""

from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from providers.media import validate_private_image
from providers.models import Benefit, Provider

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "images"
PROVIDER_FILES = {
    "KUA001": "kuar-logo.png",
    "ANT007": "antarctica-logo.png",
    "CUM001": "cumbre-logo.png",
    "CHO001": "tamara-vasak-logo.webp",
    "CAF001": "cafe-laguna-logo.webp",
}
BENEFIT_FILES = {
    "KUA001": "kuar-interior.jpg",
    "ANT007": "antarctica-common.jpg",
    "KSAR001": "ksar-navegacion.webp",
}


class Command(BaseCommand):
    help = "Carga fotos aprobadas solo en campos vacíos de registros demo (DEBUG)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo_media solo puede ejecutarse con DEBUG habilitado")

        files = {}
        for name in sorted(set(PROVIDER_FILES.values()) | set(BENEFIT_FILES.values())):
            path = FIXTURE_DIR / name
            if not path.is_file():
                raise CommandError(f"Falta el fixture de medios: {name}")
            content = ContentFile(path.read_bytes(), name=name)
            validate_private_image(content)
            files[name] = content.read()

        created = 0
        with transaction.atomic():
            for legacy, name in PROVIDER_FILES.items():
                provider = Provider.objects.select_for_update().filter(
                    legacy_public_id=legacy, demo=True,
                ).first()
                if provider and not provider.image:
                    provider.image.save(name, ContentFile(files[name], name=name), save=False)
                    provider.save(update_fields=["image"])
                    created += 1

            for legacy, name in BENEFIT_FILES.items():
                provider = Provider.objects.filter(legacy_public_id=legacy, demo=True).first()
                if not provider:
                    continue
                benefit = Benefit.objects.select_for_update().filter(
                    provider=provider, demo=True,
                ).order_by("title", "pk").first()
                if benefit and not benefit.image:
                    benefit.image.save(name, ContentFile(files[name], name=name), save=False)
                    benefit.save(update_fields=["image"])
                    created += 1

        self.stdout.write(self.style.SUCCESS(f"Medios demo agregados: {created}"))
