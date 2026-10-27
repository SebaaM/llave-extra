import uuid
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import APIException

from accounts.models import User
from credits.services import credit_wallet
from shop.models import Product, ShopSettings
from shop.services import adjust_stock, checkout, require_admin, require_customer

PRODUCT_ID = uuid.UUID("7a6f301e-1bd8-41e2-adbd-6bb74050fe81")
RECEIPT_HEADER = "DEMO — SIN VALIDEZ FISCAL — SIN COBRO REAL\n"


class Command(BaseCommand):
    help = "Crea producto, canje y reserva DEMO idempotentes en desarrollo; no crea ni modifica cuentas."

    def add_arguments(self, parser):
        parser.add_argument("--customer", type=int, required=True)
        parser.add_argument("--administrator", type=int, required=True)
        parser.add_argument("--receipts", required=True)

    def handle(self, *args, **options):
        if not settings.DEBUG or settings.SHOP_PAYMENT_PROVIDER != "fake":
            raise CommandError("seed_shop_demo requiere DEBUG y SHOP_PAYMENT_PROVIDER=fake")
        destination = Path(options["receipts"])
        if destination.exists() and not destination.read_text(encoding="utf-8").startswith(RECEIPT_HEADER):
            raise CommandError("El archivo de salida existente no es un comprobante DEMO")
        try:
            with transaction.atomic():
                users = {u.pk: u for u in User.objects.select_for_update().filter(
                    pk__in=[options["customer"], options["administrator"]]).order_by("pk")}
                customer, administrator = users[options["customer"]], users[options["administrator"]]
                require_customer(customer)
                require_admin(administrator)
                # E4 is the only writer of the wallet and ledger.
                credit_wallet(customer.pk, 500, f"shop-demo:v1:{customer.pk}")
                product, created = Product.objects.get_or_create(pk=PRODUCT_ID, defaults={
                    "name": "DEMO — Llavero 3D", "description": "Producto ficticio para pruebas locales",
                    "demo": True, "active": True, "price_money": "100.00", "price_credits": 100})
                if not product.demo:
                    raise CommandError("El identificador reservado pertenece a un producto ajeno a DEMO")
                if created:
                    adjust_stock(administrator, product.pk, delta=20, reason="Carga inicial DEMO")
                ShopSettings.objects.get_or_create(pk=1, defaults={"pickup_enabled": True,
                    "pickup_name": "DEMO — Punto ficticio", "pickup_address": "DEMO — Sin dirección real",
                    "pickup_hours": "DEMO — A coordinar"})
                orders = []
                for mode in ("CREDITS", "MONEY"):
                    order, _ = checkout(customer.pk, mode=mode,
                        items=[{"product_id": str(product.pk), "quantity": 1}], idempotency_key=f"shop-demo-v1-{mode}")
                    orders.append(order)
        except (KeyError, APIException) as exc:
            raise CommandError("Se requieren cuentas habilitadas y retiro configurado; no se modificaron cuentas") from exc
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(RECEIPT_HEADER + "".join(
            f"Pedido DEMO {order.pk} | {order.mode} | {order.state} | {order.total_money or order.total_credits}\n"
            for order in orders), encoding="utf-8")
        self.stdout.write("DEMO: producto y dos pedidos disponibles; comprobantes locales escritos sin credenciales.")
