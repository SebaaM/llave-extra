"""Shop transactions. Lock order: User -> Wallet -> Order -> Product (ascending UUID)."""
import hashlib
import json
import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from accounts.models import User
from credits.models import Wallet
from credits.services import Conflict, debit_wallet, refund_wallet

from .models import (
    CancellationRequest,
    CheckoutKey,
    Order,
    OrderAudit,
    OrderLine,
    PaymentOperation,
    Product,
    ShopSettings,
    StockAdjustment,
)

MAX_CART_LINES = 20
MAX_QUANTITY = 99


def require_customer(user, *, verified=True):
    if not user.is_active or user.role != User.Role.TOURIST or (verified and not user.email_verified):
        raise PermissionDenied("Se requiere Cliente activo con email verificado")


def require_admin(actor):
    if not User.objects.filter(pk=actor.pk, role=User.Role.ADMIN, is_active=True,
                               is_staff=True, is_superuser=True).exists():
        raise PermissionDenied("Se requiere administrador habilitado")


def clean_reason(reason):
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 500:
        raise ValidationError({"reason": "Indicá un motivo de hasta 500 caracteres"})
    return reason.strip()


def lock_customer_wallet(customer_id):
    """Requires atomic. Also used by Task 2 before taking an Order lock."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("Se requiere transacción")
    user = User.objects.select_for_update().get(pk=customer_id)
    Wallet.objects.get_or_create(tourist_id=customer_id)
    wallet = Wallet.objects.select_for_update().get(tourist_id=customer_id)
    return user, wallet


def locked_order(order_id, *, customer_id=None):
    """Requires atomic. Reads identity, then locks User -> Wallet -> Order; rechecks ownership."""
    identity = Order.objects.filter(pk=order_id).values_list("customer_id", flat=True).first()
    if identity is None or (customer_id is not None and identity != customer_id):
        raise NotFound("Pedido inexistente")
    user, _ = lock_customer_wallet(identity)
    order = Order.objects.select_for_update().get(pk=order_id, customer_id=identity)
    return user, order


def canonical_cart(mode, items):
    if mode not in Order.Mode.values or not isinstance(items, list) or not 1 <= len(items) <= MAX_CART_LINES:
        raise ValidationError("Modalidad inválida o carrito fuera de rango (1 a 20 líneas)")
    cart = {}
    for item in items:
        if not isinstance(item, dict) or set(item) != {"product_id", "quantity"}:
            raise ValidationError("Cada línea admite solo product_id y quantity")
        try:
            pk = uuid.UUID(str(item["product_id"]))
        except (ValueError, TypeError):
            raise ValidationError("Producto inválido") from None
        quantity = item["quantity"]
        if type(quantity) is not int or not 1 <= quantity <= MAX_QUANTITY or pk in cart:
            raise ValidationError("Cantidad entera entre 1 y 99; productos sin duplicados")
        cart[pk] = quantity
    return dict(sorted(cart.items()))


@transaction.atomic
def checkout(user_id, *, mode, items, idempotency_key):
    cart = canonical_cart(mode, items)
    if not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 128 or any(
        ord(ch) < 33 or ord(ch) > 126 for ch in idempotency_key
    ):
        raise ValidationError({"Idempotency-Key": "Clave obligatoria de 1 a 128 caracteres visibles"})
    fingerprint = hashlib.sha256(json.dumps([mode, [[str(pk), qty] for pk, qty in cart.items()]],
                                           separators=(",", ":")).encode()).hexdigest()
    user, _ = lock_customer_wallet(user_id)
    require_customer(user)
    previous = CheckoutKey.objects.filter(actor=user, operation="checkout", key=idempotency_key).first()
    if previous:
        if previous.fingerprint != fingerprint:
            raise Conflict("La clave ya corresponde a otro carrito")
        return Order.objects.get(pk=previous.order_id), False

    config = ShopSettings.objects.filter(pk=1).first()
    if not config or not config.pickup_enabled or not config.pickup_name.strip() or not config.pickup_address.strip():
        raise Conflict("El punto de retiro no está habilitado")
    provider = settings.SHOP_PAYMENT_PROVIDER if mode == Order.Mode.MONEY else ""
    if mode == Order.Mode.MONEY and provider not in ("fake", "mercadopago"):
        raise Conflict("Los pagos monetarios no están habilitados")
    if provider:
        from .payments.config import seller_for
        from .payments.contracts import GatewayError
        try:
            seller = seller_for(provider)
        except GatewayError:
            raise Conflict("Pasarela pendiente de habilitación operativa") from None
    products = list(Product.objects.select_for_update().filter(pk__in=cart).order_by("pk"))
    if len(products) != len(cart):
        raise ValidationError("Producto inexistente")
    price_field = "price_credits" if mode == Order.Mode.CREDITS else "price_money"
    total = 0 if mode == Order.Mode.CREDITS else Decimal("0.00")
    for product in products:
        price = getattr(product, price_field)
        if not product.active or price is None or product.stock < cart[product.pk]:
            raise Conflict("Producto no disponible en esa modalidad o stock insuficiente")
        total += price * cart[product.pk]
    order_id = uuid.uuid4()
    if mode == Order.Mode.CREDITS:
        # User/Wallet are already locked; the E4 service only reacquires our locks.
        debit_wallet(user.pk, total, f"shop:{order_id}:debit")
    order = Order.objects.create(
        id=order_id, customer=user, mode=mode,
        state=Order.State.PAID if mode == Order.Mode.CREDITS else Order.State.PENDING_PAYMENT,
        total_credits=total if mode == Order.Mode.CREDITS else None,
        total_money=total if mode == Order.Mode.MONEY else None,
        pickup_snapshot={"name": config.pickup_name, "address": config.pickup_address, "hours": config.pickup_hours},
        reserved_until=timezone.now() + timedelta(minutes=15) if mode == Order.Mode.MONEY else None,
        payment_provider=provider,
    )
    for product in products:
        quantity = cart[product.pk]
        OrderLine.objects.create(order=order, product=product, name=product.name, quantity=quantity,
                                 unit_money=product.price_money if mode == Order.Mode.MONEY else None,
                                 unit_credits=product.price_credits if mode == Order.Mode.CREDITS else None)
        product.stock -= quantity
        product.save(update_fields=["stock"])
    CheckoutKey.objects.create(actor=user, key=idempotency_key, fingerprint=fingerprint, order=order)
    if mode == Order.Mode.MONEY:
        operation = PaymentOperation.objects.create(order=order, kind=PaymentOperation.Kind.CREATE,
                                        payload={"external_reference": str(order.pk), "currency": "ARS",
                                                 "total_amount": format(total, ".2f"),
                                                 "items": [{"product_id": str(p.pk), "title": p.name,
                                                            "quantity": cart[p.pk], "unit_price": format(p.price_money, ".2f")}
                                                           for p in products]})
        from .models import PaymentContext
        from .payments.config import http_payload
        PaymentContext.objects.create(order=order, seller=seller, request=http_payload(operation.payload))
    OrderAudit.objects.create(order=order, actor=user, action="CHECKOUT", reason="Pedido confirmado localmente")
    return order, True


def release_stock(order):
    """Requires atomic and locked_order; caller sets a nondeliverable state before save."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("Se requiere transacción")
    if order.stock_released:
        return
    lines = {line.product_id: line.quantity for line in order.lines.all()}
    for product in Product.objects.select_for_update().filter(pk__in=lines).order_by("pk"):
        product.stock += lines[product.pk]
        product.save(update_fields=["stock"])
    order.stock_released = True


@transaction.atomic
def request_cancellation(user_id, order_id, *, reason):
    reason = clean_reason(reason)
    user, order = locked_order(order_id, customer_id=user_id)
    require_customer(user)
    previous = order.cancellations.filter(state=CancellationRequest.State.OPEN).first()
    if previous:
        return previous
    if order.state not in (Order.State.PAID, Order.State.READY, Order.State.PENDING_PAYMENT):
        raise Conflict("Este pedido no admite cancelación")
    result = CancellationRequest.objects.create(order=order, reason=reason)
    OrderAudit.objects.create(order=order, actor=user, action="CANCELLATION_REQUESTED", reason=reason)
    return result


@transaction.atomic
def resolve_cancellation(actor, request_id, *, approve, reason):
    require_admin(actor)
    reason = clean_reason(reason)
    if type(approve) is not bool:
        raise ValidationError("Resolución inválida")
    order_id = CancellationRequest.objects.filter(pk=request_id).values_list("order_id", flat=True).first()
    if order_id is None:
        raise NotFound("Solicitud inexistente")
    _, order = locked_order(order_id)
    request = CancellationRequest.objects.select_for_update().get(pk=request_id)
    target = CancellationRequest.State.APPROVED if approve else CancellationRequest.State.REJECTED
    if request.state != CancellationRequest.State.OPEN:
        if request.state == target:
            return request
        raise Conflict("La solicitud ya fue resuelta")
    if approve:
        if order.mode == Order.Mode.MONEY:
            from .payments.processing import cancel_money_locked
            cancel_money_locked(order)
        else:
            if order.state not in (Order.State.PAID, Order.State.READY):
                raise Conflict("El pedido no admite reintegro")
            refund_wallet(order.customer_id, order.total_credits, f"shop:{order.pk}:refund",
                          debit_reference=f"shop:{order.pk}:debit")
            order.state = Order.State.CANCELED
            release_stock(order)
            order.save(update_fields=["state", "stock_released"])
    request.state = target
    request.resolved_at = timezone.now()
    request.resolved_by = actor
    request.resolution_reason = reason
    request.save(update_fields=["state", "resolved_at", "resolved_by", "resolution_reason"])
    OrderAudit.objects.create(order=order, actor=actor, action=f"CANCELLATION_{target}", reason=reason)
    return request


@transaction.atomic
def advance_order(actor, order_id, *, target, reason):
    require_admin(actor)
    reason = clean_reason(reason)
    _, order = locked_order(order_id)
    expected = {Order.State.READY: Order.State.PAID, Order.State.PICKED_UP: Order.State.READY}
    if target not in expected:
        raise ValidationError("Transición no admitida")
    if order.stock_released or order.cancellations.filter(state=CancellationRequest.State.OPEN).exists() or order.payment_operations.filter(kind="REFUND").exists():
        raise Conflict("El pedido tiene cancelación, reintegro o stock pendiente")
    if order.state == target:
        return order
    if order.state != expected[target]:
        raise Conflict("El estado actual no permite esta transición")
    order.state = target
    order.save(update_fields=["state"])
    OrderAudit.objects.create(order=order, actor=actor, action=target, reason=reason)
    return order


@transaction.atomic
def adjust_stock(actor, product_id, *, delta, reason):
    require_admin(actor)
    reason = clean_reason(reason)
    if type(delta) is not int or delta == 0 or abs(delta) > 1_000_000:
        raise ValidationError("Variación entera no nula, de hasta 1.000.000 unidades")
    product = Product.objects.select_for_update().get(pk=product_id)
    if not 0 <= product.stock + delta <= 2_000_000_000:
        raise Conflict("Stock resultante fuera de rango")
    product.stock += delta
    product.save(update_fields=["stock"])
    return StockAdjustment.objects.create(product=product, actor=actor, delta=delta,
                                          resulting_stock=product.stock, reason=reason)
