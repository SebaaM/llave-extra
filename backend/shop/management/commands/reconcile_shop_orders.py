from django.core.management.base import BaseCommand, CommandError
from django.db.models import F

from shop.models import Order
from shop.payments.processing import enqueue_reconcile


class Command(BaseCommand):
    help = "Encola consultas de todos los estados monetarios con referencia, incluidos entregados y reintegrados."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = options["limit"]
        if not 1 <= limit <= 1000:
            raise CommandError("limit debe estar entre 1 y 1000")
        # Oldest observation first: rotating coverage without an unbounded command.
        ids = list(Order.objects.filter(mode="MONEY").exclude(remote_id="").order_by(
            F("paymentcontext__version").asc(nulls_first=True), "created_at", "pk").values_list("pk", flat=True)[:limit])
        for pk in ids:
            enqueue_reconcile(pk)
        self.stdout.write(f"Pedidos encolados: {len(ids)}")
