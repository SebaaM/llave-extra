from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from shop.models import Order
from shop.payments.contracts import GatewayError
from shop.payments.fake import simulate
from shop.payments.processing import enqueue_reconcile


class Command(BaseCommand):
    help = "DEMO: simula pago, reintegro o estado desconocido durable; requiere DEBUG y fake."

    def add_arguments(self, parser):
        parser.add_argument("order_id")
        parser.add_argument("state", choices=["paid", "refunded", "unknown"])

    def handle(self, *args, **options):
        if not settings.DEBUG or settings.SHOP_PAYMENT_PROVIDER != "fake":
            raise CommandError("Solo disponible en desarrollo con fake")
        try:
            order = Order.objects.get(pk=options["order_id"], payment_provider="fake", mode="MONEY")
            if not order.remote_id:
                raise CommandError("Procesar CREATE antes de simular")
            simulate(order.remote_id, options["state"])
            enqueue_reconcile(order.pk)
        except (Order.DoesNotExist, ValueError, GatewayError):
            raise CommandError("Pedido DEMO o transición inválidos") from None
        self.stdout.write("DEMO: estado remoto actualizado; ejecutar process_shop_outbox para consultar.")
