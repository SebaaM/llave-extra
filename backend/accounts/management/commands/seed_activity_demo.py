import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from rest_framework.exceptions import APIException

from accounts.demo_activity.activity import seed_customer, seed_payment, summary
from accounts.demo_activity.catalog import PREFIX, Credentials, bootstrap, email, identity
from accounts.models import User
from providers.models import DemoSeedState

LOCK_ID = 72643831920021


class Command(BaseCommand):
    help = "Carga opcional y reanudable de actividad ficticia para web/backoffice; solo DEBUG, PostgreSQL y fake."

    def add_arguments(self, parser):
        parser.add_argument("--customers", type=int, default=300, help="Cantidad total de Clientes demo (20–3000).")
        parser.add_argument("--credentials", help="Archivo JSON privado de accesos; conservar para reintentar.")

    def handle(self, *args, **options):
        if not settings.DEBUG or settings.SHOP_PAYMENT_PROVIDER != "fake" or connection.vendor != "postgresql":
            raise CommandError("Requiere DEBUG, PostgreSQL y SHOP_PAYMENT_PROVIDER=fake explícito; no llama a servicios externos")
        if connection.in_atomic_block:
            raise CommandError("Ejecutar fuera de una transacción externa para respetar el procesamiento de pagos")
        count = options["customers"]
        if not 20 <= count <= 3000:
            raise CommandError("--customers debe estar entre 20 y 3000")
        destination = Path(options["credentials"] or Path(settings.DEMO_CREDENTIALS_PATH).with_name("activity-demo.local.json"))
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", [LOCK_ID])
            if not cursor.fetchone()[0]:
                raise CommandError("Ya hay otra carga de actividad demo en ejecución")
        try:
            credentials = Credentials(destination)
            credentials.bind_database()
            if DemoSeedState.objects.filter(pk=f"{PREFIX}:catalog").exists():
                addresses = User.objects.filter(email__startswith="activity.").values_list("email", flat=True)
                if (any(address not in credentials.data["users"] for address in addresses)
                        or any(str(identity("provider", i)) not in credentials.data["pins"] for i in range(30))):
                    raise CommandError("Falta el archivo completo de accesos de esta demo; restauralo antes de reintentar")
            bootstrap(credentials)
            # Require the seed administrator, without changing an edited account.
            admin = User.objects.get(email=email("admin"))
            if not (admin.is_active and admin.is_staff and admin.is_superuser and admin.role == User.Role.ADMIN):
                raise CommandError("El administrador demo fue modificado; no se restablece automáticamente")
            for index in range(count):
                seed_customer(credentials, index)
                seed_payment(index)
                if (index + 1) % 50 == 0:
                    self.stdout.write(f"Clientes procesados: {index + 1}/{count}")
            self.stdout.write(json.dumps(summary(), ensure_ascii=False))
            self.stdout.write(self.style.SUCCESS(f"DEMO completada. Accesos privados: {destination}. Sin cobros reales."))
        except APIException as exc:
            raise CommandError("Escenario demo rechazado por el dominio; revisar configuración/datos y reintentar con el mismo archivo") from exc
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [LOCK_ID])
