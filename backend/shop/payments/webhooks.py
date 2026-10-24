import hashlib
import hmac
import json
import re
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from shop.models import Order, PaymentInbox
from shop.services import locked_order

from .config import gateway_for
from .contracts import GatewayError, identifier
from .processing import bind_locked, context_locked, enqueue_reconcile_locked


def verify(request):
    if (not settings.SHOP_MP_WEBHOOK_SECRET or len(request.META.get("QUERY_STRING", "")) > 512
            or request.query_params.getlist("type") != ["order"]
            or len(request.query_params.getlist("data.id")) != 1):
        raise ValueError
    remote_id = identifier(request.query_params["data.id"])
    request_id = request.headers.get("X-Request-Id", "")
    signature = request.headers.get("X-Signature", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", request_id) or len(signature) > 180:
        raise ValueError
    parts = signature.split(",")
    values = {}
    for part in parts:
        key, value = part.strip().split("=", 1)
        if key in values:
            raise ValueError
        values[key] = value
    if set(values) != {"ts", "v1"} or not re.fullmatch(r"(?:[0-9]{10}|[0-9]{13})", values["ts"]):
        raise ValueError
    if not re.fullmatch(r"[0-9a-fA-F]{64}", values["v1"]):
        raise ValueError
    timestamp = int(values["ts"]) / (1000 if len(values["ts"]) == 13 else 1)
    age = timezone.now().timestamp() - timestamp
    if not -60 <= age <= 600:
        raise ValueError
    manifest = f"id:{remote_id};request-id:{request_id};ts:{values['ts']};".encode()
    expected = hmac.new(settings.SHOP_MP_WEBHOOK_SECRET.encode(), manifest, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, values["v1"].lower()):
        raise ValueError
    if int(request.META.get("CONTENT_LENGTH") or 0) > 8192:
        raise ValueError
    body = request.body
    if len(body) > 8192:
        raise ValueError
    data = json.loads(body) if body else {}
    if not isinstance(data, dict) or not isinstance(data.get("data", {}), dict):
        raise ValueError
    if data.get("type", "order") != "order" or data.get("data", {}).get("id", remote_id) != remote_id:
        raise ValueError
    return remote_id, hashlib.sha256(manifest).hexdigest()


class OrderWebhook(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[
            OpenApiParameter("type", str, OpenApiParameter.QUERY, required=True, enum=["order"]),
            OpenApiParameter("data.id", str, OpenApiParameter.QUERY, required=True),
            OpenApiParameter("X-Request-Id", str, OpenApiParameter.HEADER, required=True),
            OpenApiParameter("X-Signature", str, OpenApiParameter.HEADER, required=True),
        ],
        request={"application/json": {"type": "object", "properties": {
                 "type": {"type": "string", "enum": ["order"]},
                 "data": {"type": "object", "properties": {"id": {"type": "string"}}}}}},
        responses={200: None, 401: None},
        description="Notificación Order HMAC; query/ts literales, cuerpo hasta 8 KiB, edad máxima 10 minutos. Solo encola GET; no acredita dinero.",
    )
    def post(self, request):
        try:
            remote_id, delivery = verify(request)
        except (ValueError, TypeError, KeyError, UnicodeError, GatewayError):
            return Response({"detail": "Notificación inválida"}, status=401)
        PaymentInbox.objects.get_or_create(delivery=delivery, defaults={"remote_id": remote_id})
        return Response(status=200)


@transaction.atomic
def claim_inbox(pk):
    row = PaymentInbox.objects.select_for_update().get(pk=pk)
    now = timezone.now()
    if row.done or row.available_at > now or (row.lease_until and row.lease_until > now):
        return None
    row.lease_token = uuid.uuid4()
    row.lease_until = now + timedelta(seconds=60)
    row.attempts += 1
    row.save(update_fields=["lease_token", "lease_until", "attempts"])
    return row


@transaction.atomic
def link_inbox(snapshot, remote):
    # Untrusted references must be valid UUIDs before a database lookup.
    try:
        order_id = uuid.UUID(remote.external_reference)
    except (ValueError, TypeError, AttributeError):
        raise GatewayError("inbox_unlinked") from None
    if not Order.objects.filter(pk=order_id, payment_provider="mercadopago", mode="MONEY").exists():
        raise GatewayError("inbox_unlinked")
    _, order = locked_order(order_id)
    row = PaymentInbox.objects.select_for_update().get(pk=snapshot.pk)
    if row.done or row.lease_token != snapshot.lease_token or row.lease_until <= timezone.now():
        return
    context = context_locked(order)
    if not order.payment_operations.filter(kind="CREATE").exists() or remote.id != row.remote_id or not bind_locked(order, context, remote):
        raise GatewayError("inbox_mismatch")
    # Never apply this possibly old GET: a fenced RECONCILE obtains a fresh observation.
    enqueue_reconcile_locked(order)
    row.done = True
    row.last_code = "linked"
    row.lease_until = None
    row.lease_token = None
    row.save(update_fields=["done", "last_code", "lease_until", "lease_token"])


def process_inbox(*, limit=100, gateway=None):
    now = timezone.now()
    ids = list(PaymentInbox.objects.filter(done=False, available_at__lte=now).filter(
        Q(lease_until__isnull=True) | Q(lease_until__lte=now)).order_by("available_at", "pk").values_list("pk", flat=True)[:limit])
    count = 0
    for pk in ids:
        row = claim_inbox(pk)
        if not row:
            continue
        try:
            remote = (gateway or gateway_for("mercadopago")).get_order(row.remote_id)
            link_inbox(row, remote)
        except GatewayError as error:
            # Unknown early deliveries stay durable and recoverable; never silently discard.
            PaymentInbox.objects.filter(pk=pk, lease_token=row.lease_token, done=False).update(
                lease_token=None, lease_until=None, last_code=error.code,
                available_at=timezone.now() + timedelta(seconds=min(3600, 5 * 2 ** min(row.attempts, 9))))
        count += 1
    return count
