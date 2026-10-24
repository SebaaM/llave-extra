from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from shop.models import Order
from shop.payments.processing import expire_order


class Command(BaseCommand):
    help = "Libera reservas locales vencidas, una vez, conservando referencias de pago."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = options["limit"]
        if not 1 <= limit <= 1000:
            raise CommandError("limit debe estar entre 1 y 1000")
        ids = list(Order.objects.filter(mode="MONEY", state="PENDING_PAYMENT", reserved_until__lte=timezone.now())
                   .order_by("reserved_until", "pk").values_list("pk", flat=True)[:limit])
        count = sum(expire_order(pk) for pk in ids)
        self.stdout.write(f"Reservas vencidas: {count}")
