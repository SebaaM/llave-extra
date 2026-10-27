import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from .media import product_image_path, product_storage, validate_private_image


class Product(models.Model):
    demo = models.BooleanField("Producto DEMO", default=False, editable=False)
    id = models.UUIDField("Identificador", primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField("Nombre", max_length=160)
    description = models.TextField("Descripción", blank=True)
    image = models.ImageField("Imagen", upload_to=product_image_path, storage=product_storage,
                              validators=[validate_private_image], blank=True)
    active = models.BooleanField("Activo", default=False)
    stock = models.PositiveIntegerField("Stock disponible", default=0)
    price_money = models.DecimalField("Precio en ARS", max_digits=12, decimal_places=2, null=True, blank=True)
    price_credits = models.PositiveIntegerField("Precio en créditos", null=True, blank=True)

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"
        constraints = [
            models.CheckConstraint(condition=Q(stock__gte=0), name="shop_stock_nonnegative"),
            models.CheckConstraint(condition=Q(price_money__isnull=True) | Q(price_money__gt=0), name="shop_money_positive"),
            models.CheckConstraint(condition=Q(price_credits__isnull=True) | Q(price_credits__gt=0), name="shop_credits_positive"),
            models.CheckConstraint(condition=Q(price_money__isnull=False) | Q(price_credits__isnull=False), name="shop_price_required"),
        ]

    def __str__(self):
        return self.name


class ShopSettings(models.Model):
    singleton = models.PositiveSmallIntegerField("Identificador", primary_key=True, default=1, editable=False)
    pickup_enabled = models.BooleanField("Retiro habilitado", default=False)
    pickup_name = models.CharField("Punto de retiro", max_length=160, blank=True)
    pickup_address = models.CharField("Dirección de retiro", max_length=300, blank=True)
    pickup_hours = models.CharField("Horarios de retiro", max_length=300, blank=True)

    class Meta:
        verbose_name = "Configuración de retiro"
        verbose_name_plural = "Configuración de retiro"
        constraints = [models.CheckConstraint(condition=Q(singleton=1), name="shop_settings_singleton")]


class Order(models.Model):
    class Mode(models.TextChoices):
        CREDITS = "CREDITS", "Créditos"
        MONEY = "MONEY", "Dinero"

    class State(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT", "Pendiente de pago"
        PAID = "PAID", "Pagado"
        READY = "READY", "Preparado"
        PICKED_UP = "PICKED_UP", "Entregado"
        CANCELED = "CANCELED", "Cancelado"
        EXPIRED = "EXPIRED", "Vencido"
        PAYMENT_REVIEW = "PAYMENT_REVIEW", "Pago en revisión"
        REFUND_PENDING = "REFUND_PENDING", "Reintegro pendiente"
        REFUNDED = "REFUNDED", "Reintegrado"

    id = models.UUIDField("Identificador", primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Cliente", on_delete=models.PROTECT)
    mode = models.CharField("Modalidad", max_length=8, choices=Mode.choices)
    state = models.CharField("Estado", max_length=20, choices=State.choices)
    currency = models.CharField("Moneda", max_length=3, default="ARS", editable=False)
    total_money = models.DecimalField("Total ARS", max_digits=16, decimal_places=2, null=True, blank=True)
    total_credits = models.PositiveBigIntegerField("Total créditos", null=True, blank=True)
    pickup_snapshot = models.JSONField("Retiro acordado")
    created_at = models.DateTimeField("Creado", auto_now_add=True)
    reserved_until = models.DateTimeField("Reserva hasta", null=True, blank=True)
    stock_released = models.BooleanField("Stock liberado", default=False)
    payment_provider = models.CharField("Proveedor de pago", max_length=20, blank=True)
    payment_confirmed = models.BooleanField("Pago monetario confirmado alguna vez", default=False, editable=False)
    remote_id = models.CharField("Identificador remoto", max_length=100, blank=True)
    checkout_url = models.URLField("Enlace de pago", max_length=1000, blank=True)

    class Meta:
        verbose_name = "Pedido"
        verbose_name_plural = "Pedidos"
        constraints = [
            models.CheckConstraint(condition=Q(currency="ARS"), name="shop_currency_ars"),
            models.CheckConstraint(condition=(Q(mode="CREDITS", total_credits__gt=0, total_credits__isnull=False, total_money__isnull=True, reserved_until__isnull=True, payment_provider="") | (Q(mode="MONEY", total_money__gt=0, total_money__isnull=False, total_credits__isnull=True, reserved_until__isnull=False) & ~Q(payment_provider=""))), name="shop_order_mode_totals"),
            models.CheckConstraint(condition=Q(state__in=["PENDING_PAYMENT", "PAID", "READY", "PICKED_UP", "CANCELED", "EXPIRED", "PAYMENT_REVIEW", "REFUND_PENDING", "REFUNDED"]), name="shop_order_state_valid"),
            models.CheckConstraint(condition=Q(stock_released=False) | ~Q(state__in=["PAID", "READY", "PICKED_UP"]), name="shop_released_not_deliverable"),
            models.UniqueConstraint(fields=["payment_provider", "remote_id"], condition=~Q(remote_id=""), name="shop_remote_order_unique"),
            models.CheckConstraint(condition=~Q(mode="MONEY", state__in=["PAID", "READY", "PICKED_UP", "REFUNDED"]) | Q(payment_confirmed=True), name="shop_money_paid_confirmed"),
        ]

    def __str__(self):
        return str(self.pk)


class OrderLine(models.Model):
    order = models.ForeignKey(Order, verbose_name="Pedido", on_delete=models.PROTECT, related_name="lines")
    product = models.ForeignKey(Product, verbose_name="Producto", on_delete=models.PROTECT)
    name = models.CharField("Nombre comprado", max_length=160)
    quantity = models.PositiveSmallIntegerField("Cantidad")
    unit_money = models.DecimalField("Precio unitario ARS", max_digits=12, decimal_places=2, null=True, blank=True)
    unit_credits = models.PositiveIntegerField("Precio unitario créditos", null=True, blank=True)

    class Meta:
        verbose_name = "Línea de pedido"
        verbose_name_plural = "Líneas de pedido"
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="shop_line_unique"),
            models.CheckConstraint(condition=Q(quantity__gte=1, quantity__lte=99), name="shop_line_quantity_bound"),
            models.CheckConstraint(condition=(Q(unit_money__gt=0, unit_money__isnull=False, unit_credits__isnull=True) | Q(unit_credits__gt=0, unit_credits__isnull=False, unit_money__isnull=True)), name="shop_line_price_positive"),
        ]


class CheckoutKey(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Cliente", on_delete=models.PROTECT)
    operation = models.CharField("Operación", max_length=20, default="checkout")
    key = models.CharField("Clave idempotente", max_length=128)
    fingerprint = models.CharField("Huella", max_length=64)
    order = models.OneToOneField(Order, verbose_name="Pedido", on_delete=models.PROTECT)
    created_at = models.DateTimeField("Creado", auto_now_add=True)

    class Meta:
        verbose_name = "Clave de compra"
        verbose_name_plural = "Claves de compra"
        constraints = [models.UniqueConstraint(fields=["actor", "operation", "key"], name="shop_checkout_key_unique")]


class CancellationRequest(models.Model):
    class State(models.TextChoices):
        OPEN = "OPEN", "Abierta"
        APPROVED = "APPROVED", "Aprobada"
        REJECTED = "REJECTED", "Rechazada"

    order = models.ForeignKey(Order, verbose_name="Pedido", on_delete=models.PROTECT, related_name="cancellations")
    reason = models.CharField("Motivo del cliente", max_length=500)
    state = models.CharField("Estado", max_length=10, choices=State.choices, default=State.OPEN)
    created_at = models.DateTimeField("Solicitada", auto_now_add=True)
    resolved_at = models.DateTimeField("Resuelta", null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Resuelta por", on_delete=models.PROTECT, null=True, blank=True)
    resolution_reason = models.CharField("Motivo administrativo", max_length=500, blank=True)

    class Meta:
        verbose_name = "Solicitud de cancelación"
        verbose_name_plural = "Solicitudes de cancelación"
        constraints = [
            models.UniqueConstraint(fields=["order"], condition=Q(state="OPEN"), name="shop_one_open_cancellation"),
            models.CheckConstraint(condition=(Q(state="OPEN", resolved_at__isnull=True, resolved_by__isnull=True, resolution_reason="") | (Q(state__in=["APPROVED", "REJECTED"], resolved_at__isnull=False, resolved_by__isnull=False) & ~Q(resolution_reason=""))), name="shop_cancellation_resolution"),
        ]


class StockAdjustment(models.Model):
    product = models.ForeignKey(Product, verbose_name="Producto", on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Administrador", on_delete=models.PROTECT)
    delta = models.IntegerField("Variación")
    resulting_stock = models.PositiveIntegerField("Stock resultante")
    reason = models.CharField("Motivo", max_length=500)
    created_at = models.DateTimeField("Fecha", auto_now_add=True)

    class Meta:
        verbose_name = "Ajuste de stock"
        verbose_name_plural = "Ajustes de stock"
        constraints = [models.CheckConstraint(condition=~Q(delta=0), name="shop_stock_delta_nonzero")]


class OrderAudit(models.Model):
    order = models.ForeignKey(Order, verbose_name="Pedido", on_delete=models.PROTECT, related_name="audit")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Actor", on_delete=models.PROTECT, null=True, blank=True)
    action = models.CharField("Acción", max_length=40)
    reason = models.CharField("Motivo", max_length=500)
    created_at = models.DateTimeField("Fecha", auto_now_add=True)

    class Meta:
        verbose_name = "Auditoría de pedido"
        verbose_name_plural = "Auditoría de pedidos"


class PaymentOperation(models.Model):
    class Kind(models.TextChoices):
        CREATE = "CREATE", "Crear pago"
        REFUND = "REFUND", "Reintegrar pago"
        RECONCILE = "RECONCILE", "Consultar pago"

    class State(models.TextChoices):
        PENDING = "PENDING", "Pendiente"
        RUNNING = "RUNNING", "En proceso"
        DONE = "DONE", "Completada"
        BLOCKED = "BLOCKED", "Bloqueada"

    id = models.UUIDField("Identificador", primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, verbose_name="Pedido", on_delete=models.PROTECT, related_name="payment_operations")
    kind = models.CharField("Operación", max_length=10, choices=Kind.choices)
    external_key = models.UUIDField("Clave externa", default=uuid.uuid4, unique=True, editable=False)
    payload = models.JSONField("Carga estable")
    state = models.CharField("Estado", max_length=10, choices=State.choices, default=State.PENDING)
    attempts = models.PositiveIntegerField("Intentos", default=0)
    available_at = models.DateTimeField("Disponible desde", default=timezone.now)
    lease_until = models.DateTimeField("Arrendamiento hasta", null=True, blank=True)
    lease_token = models.UUIDField("Token de ejecución", null=True, blank=True)
    generation = models.PositiveBigIntegerField("Generación de ejecución", default=0)
    last_code = models.CharField("Último código sanitizado", max_length=80, blank=True)
    created_at = models.DateTimeField("Creada", auto_now_add=True)

    class Meta:
        verbose_name = "Operación de pago"
        verbose_name_plural = "Operaciones de pago"
        indexes = [models.Index(fields=["state", "available_at"], name="shop_outbox_due")]
        constraints = [
            models.UniqueConstraint(fields=["order", "kind"], name="shop_payment_kind_unique"),
            models.CheckConstraint(condition=Q(kind__in=["CREATE", "REFUND", "RECONCILE"]), name="shop_operation_kind_valid"),
            models.CheckConstraint(condition=Q(state__in=["PENDING", "RUNNING", "DONE", "BLOCKED"]), name="shop_operation_state_valid"),
            models.CheckConstraint(condition=Q(generation__gte=F("attempts")), name="shop_fencing_generation"),
        ]


class PaymentContext(models.Model):
    order = models.OneToOneField(Order, verbose_name="Pedido", on_delete=models.PROTECT, primary_key=True)
    seller = models.CharField("Vendedor esperado", max_length=100)
    request = models.JSONField("Request HTTP congelado")
    version = models.PositiveBigIntegerField("Versión de observación", default=0)

    class Meta:
        verbose_name = "Contrato de pago"
        verbose_name_plural = "Contratos de pago"


class PaymentInbox(models.Model):
    remote_id = models.CharField("Pedido remoto firmado", max_length=100)
    delivery = models.CharField("Huella de entrega", max_length=64, unique=True)
    received_at = models.DateTimeField("Recibida", auto_now_add=True)
    available_at = models.DateTimeField("Disponible desde", default=timezone.now)
    attempts = models.PositiveIntegerField("Intentos", default=0)
    lease_token = models.UUIDField("Token de ejecución", null=True)
    lease_until = models.DateTimeField("Arrendamiento hasta", null=True)
    done = models.BooleanField("Procesada", default=False)
    last_code = models.CharField("Resultado sanitizado", max_length=80, blank=True)

    class Meta:
        verbose_name = "Notificación de pago"
        verbose_name_plural = "Notificaciones de pago"
        indexes = [models.Index(fields=["done", "available_at"], name="shop_inbox_due")]


class FakeRemoteOrder(models.Model):
    id = models.CharField("Identificador DEMO", max_length=100, primary_key=True)
    create_key = models.UUIDField("Clave de creación DEMO", unique=True)
    request = models.JSONField("Request DEMO")
    response = models.JSONField("Estado remoto DEMO")
    refund_key = models.UUIDField("Clave de reintegro DEMO", null=True, unique=True)

    class Meta:
        verbose_name = "Pago simulado DEMO"
        verbose_name_plural = "Pagos simulados DEMO"
