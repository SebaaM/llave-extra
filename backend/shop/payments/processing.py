"""All order transitions lock User -> Wallet -> Order before auxiliary rows/products.

Claims are bounded, durable leases. The per-order version also fences responses
from *different* operation kinds. No network call takes place in these atomics.
"""
import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from credits.services import Conflict
from shop.models import Order, OrderAudit, PaymentContext, PaymentOperation
from shop.services import clean_reason, locked_order, release_stock, require_admin

from .config import gateway_for, http_payload, seller_for
from .contracts import GatewayError
from .observations import financial_state, matches

LEASE_SECONDS = 60


def context_locked(order):
    context = PaymentContext.objects.filter(order=order).first()
    if context is None:
        # T1 could only create fake orders. Never guess a seller for a real payment.
        if order.payment_provider != "fake":
            raise GatewayError("missing_payment_contract")
        operation = order.payment_operations.get(kind="CREATE")
        context = PaymentContext.objects.create(order=order, seller="DEMO", request=http_payload(operation.payload))
    return context


def enqueue_reconcile_locked(order):
    operation, created = PaymentOperation.objects.get_or_create(order=order, kind="RECONCILE", defaults={"payload": {}})
    if not created and operation.state in ("DONE", "BLOCKED"):
        operation.state = "PENDING"
        operation.available_at = timezone.now()
        operation.generation += 1
        operation.save(update_fields=["state", "available_at", "generation"])
    return operation


@transaction.atomic
def enqueue_reconcile(order_id):
    _, order = locked_order(order_id)
    if order.mode == "MONEY" and order.remote_id:
        enqueue_reconcile_locked(order)


def enqueue_refund_locked(order):
    if not order.remote_id:
        raise Conflict("No hay referencia remota confirmada; reconciliar primero")
    PaymentOperation.objects.get_or_create(order=order, kind="REFUND", defaults={"payload": {"remote_id": order.remote_id, "body": {}}})
    order.state = "REFUND_PENDING"
    order.save(update_fields=["state"])


def cancel_money_locked(order):
    if order.state in ("PAID", "READY", "PAYMENT_REVIEW"):
        enqueue_refund_locked(order)
    elif order.state in ("PENDING_PAYMENT", "EXPIRED", "CANCELED"):
        order.state = "CANCELED"
        release_stock(order)
        order.save(update_fields=["state", "stock_released"])
        if order.remote_id:
            enqueue_reconcile_locked(order)
    else:
        raise Conflict("El estado actual no admite cancelación monetaria")


@transaction.atomic
def request_refund(actor, order_id, *, reason):
    require_admin(actor)
    reason = clean_reason(reason)
    _, order = locked_order(order_id)
    if order.mode != "MONEY" or order.state not in ("PAYMENT_REVIEW", "REFUND_PENDING"):
        raise Conflict("Solo pagos en revisión o reintegro pendiente")
    enqueue_refund_locked(order)
    OrderAudit.objects.create(order=order, actor=actor, action="REFUND_REQUESTED", reason=reason)


@transaction.atomic
def retry_operation(actor, operation_id, *, reason):
    require_admin(actor)
    reason = clean_reason(reason)
    identity = PaymentOperation.objects.get(pk=operation_id).order_id
    _, order = locked_order(identity)
    operation = PaymentOperation.objects.select_for_update().get(pk=operation_id)
    if operation.state != "BLOCKED":
        raise Conflict("Solo se reintentan operaciones bloqueadas")
    operation.state = "PENDING"
    operation.available_at = timezone.now()
    operation.save(update_fields=["state", "available_at"])
    OrderAudit.objects.create(order=order, actor=actor, action="PAYMENT_RETRY", reason=reason)


@transaction.atomic
def expire_order(order_id):
    _, order = locked_order(order_id)
    if order.state == "PENDING_PAYMENT" and order.reserved_until <= timezone.now():
        order.state = "EXPIRED"
        release_stock(order)
        order.save(update_fields=["state", "stock_released"])
        OrderAudit.objects.create(order=order, action="EXPIRED", reason="Reserva local vencida")
        if order.remote_id:
            enqueue_reconcile_locked(order)
        return True
    return False


@transaction.atomic
def claim(operation_id):
    identity = PaymentOperation.objects.filter(pk=operation_id).values_list("order_id", flat=True).first()
    if identity is None:
        return None
    _, order = locked_order(identity)
    now = timezone.now()
    operation = PaymentOperation.objects.select_for_update().get(pk=operation_id)
    if (operation.state not in ("PENDING", "RUNNING") or operation.available_at > now
            or (operation.state == "RUNNING" and operation.lease_until and operation.lease_until > now)
            or order.payment_operations.filter(state="RUNNING", lease_until__gt=now).exclude(pk=operation.pk).exists()):
        return None
    if operation.kind != "CREATE" and not order.remote_id:
        return None
    context = context_locked(order)
    context.version += 1
    context.save(update_fields=["version"])
    operation.state = "RUNNING"
    operation.attempts += 1
    operation.generation += 1
    operation.lease_token = uuid.uuid4()
    operation.lease_until = now + timedelta(seconds=LEASE_SECONDS)
    operation.save(update_fields=["state", "attempts", "generation", "lease_token", "lease_until"])
    return operation, order, context


def review_locked(order, code):
    if order.state not in ("PICKED_UP", "REFUNDED", "REFUND_PENDING"):
        order.state = "PAYMENT_REVIEW"
        order.save(update_fields=["state"])
    # Keep physical delivery and released inventory intact even for a chargeback.
    if not order.audit.filter(action="PAYMENT_REVIEW", reason=code).exists():
        OrderAudit.objects.create(order=order, action="PAYMENT_REVIEW", reason=code)


def bind_locked(order, context, remote):
    if not matches(order, context, remote):
        return False
    if Order.objects.filter(payment_provider=order.payment_provider, remote_id=remote.id).exclude(pk=order.pk).exists():
        return False
    order.remote_id = remote.id
    if remote.checkout_url:
        order.checkout_url = remote.checkout_url
    order.save(update_fields=["remote_id", "checkout_url"])
    return True


def apply_observation_locked(order, remote):
    state = financial_state(remote)
    if order.state == "PICKED_UP":
        if state != "paid":
            review_locked(order, "financial_change_after_pickup")
        return
    if order.state == "REFUNDED":
        if state != "refunded":
            review_locked(order, "financial_change_after_refund")
        return
    if state == "refunded":
        order.state = "REFUNDED"
        release_stock(order)
        order.save(update_fields=["state", "stock_released"])
        OrderAudit.objects.create(order=order, action="REFUNDED", reason="GET confirma restitución total")
        return
    if state == "paid":
        if order.state in ("PAID", "READY", "REFUND_PENDING"):
            return
        if order.state == "PENDING_PAYMENT" and not order.stock_released and timezone.now() < order.reserved_until:
            order.state = "PAID"
            order.save(update_fields=["state"])
            OrderAudit.objects.create(order=order, action="PAID", reason="GET confirma pago íntegro")
        else:
            if order.state == "PENDING_PAYMENT":
                order.state = "PAYMENT_REVIEW"
                release_stock(order)
                order.save(update_fields=["state", "stock_released"])
            review_locked(order, "late_or_reviewed_payment")
    elif state == "review" or order.state in ("PAID", "READY"):
        review_locked(order, "inconsistent_remote_state")


@transaction.atomic
def finish(claimed, *, remote=None, error=None):
    snapshot, original, context_snapshot = claimed
    _, order = locked_order(original.pk)
    operation = PaymentOperation.objects.select_for_update().get(pk=snapshot.pk)
    context = context_locked(order)
    if (operation.state != "RUNNING" or operation.lease_token != snapshot.lease_token
            or operation.generation != snapshot.generation or context.version != context_snapshot.version
            or operation.lease_until <= timezone.now()):
        return False
    operation.lease_until = None
    operation.lease_token = None
    if error:
        operation.last_code = error.code
        operation.state = "PENDING" if error.retry else "BLOCKED"
        operation.available_at = timezone.now() + timedelta(seconds=min(3600, 5 * 2 ** min(operation.attempts, 9)))
        if order.state in ("PAID", "READY") or not error.retry:
            review_locked(order, error.code)
        if order.remote_id:
            enqueue_reconcile_locked(order)
    elif not bind_locked(order, context, remote):
        operation.state = "BLOCKED"
        operation.last_code = "remote_mismatch"
        review_locked(order, "remote_mismatch")
    else:
        operation.state = "DONE"
        operation.last_code = "ok"
        if operation.kind == "CREATE":
            enqueue_reconcile_locked(order)
        else:
            apply_observation_locked(order, remote)
            if operation.kind == "REFUND" and order.state != "REFUNDED":
                # Acknowledged POST is not a completed refund. GET polling continues.
                enqueue_reconcile_locked(order)
    operation.save(update_fields=["state", "last_code", "available_at", "lease_token", "lease_until"])
    return True


def execute(claimed, *, gateway=None):
    operation, order, context = claimed
    try:
        if gateway is None:
            if seller_for(order.payment_provider) != context.seller:
                raise GatewayError("seller_configuration_changed")
            gateway = gateway_for(order.payment_provider)
        if operation.kind == "CREATE":
            remote = gateway.get_order(order.remote_id) if order.remote_id else None
            if remote is None and operation.attempts > 1:
                remote = gateway.find_order(str(order.pk), begin_date=order.created_at - timedelta(minutes=5),
                                            end_date=timezone.now() + timedelta(minutes=1))
            if remote is None:
                try:
                    remote = gateway.create_order(context.request, idempotency_key=str(operation.external_key))
                except GatewayError as error:
                    if error.code != "http_409":
                        raise
                    remote = gateway.find_order(str(order.pk), begin_date=order.created_at - timedelta(minutes=5),
                                                end_date=timezone.now() + timedelta(minutes=1))
                    if remote is None:
                        raise GatewayError("create_unknown", retry=True) from None
        elif operation.kind == "REFUND":
            # Recovery before repeat POST, including HTTP 409/timeout on earlier attempts.
            remote = gateway.get_order(order.remote_id)
            if not matches(order, context, remote):
                raise GatewayError("remote_mismatch")
            if financial_state(remote) != "refunded":
                gateway.refund_order(operation.payload["remote_id"], idempotency_key=str(operation.external_key))
                remote = gateway.get_order(order.remote_id)
        else:
            remote = gateway.get_order(order.remote_id)
        return finish(claimed, remote=remote)
    except GatewayError as error:
        return finish(claimed, error=error)


def process_outbox(*, limit=100, gateway=None):
    now = timezone.now()
    ids = list(PaymentOperation.objects.filter(available_at__lte=now).filter(
        Q(state="PENDING") | Q(state="RUNNING", lease_until__lte=now)).order_by("available_at", "pk").values_list("pk", flat=True)[:limit])
    count = 0
    for pk in ids:
        claimed = claim(pk)
        if claimed:
            execute(claimed, gateway=gateway)
            count += 1
    return count
