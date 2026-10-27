import copy
import uuid

from django.db import transaction

from shop.models import FakeRemoteOrder

from .config import seller_for
from .contracts import GatewayError, RemoteOrder


class FakeGateway:
    """Durable development-only remote. URL is always absent; receipts say DEMO."""

    def __init__(self):
        seller_for("fake")

    @transaction.atomic
    def create_order(self, payload, *, idempotency_key):
        remote_id = "DEMO_" + str(idempotency_key).replace("-", "")
        response = {"id": remote_id, "external_reference": payload["external_reference"], "user_id": "DEMO",
                    "currency": "ARS", "country_code": "ARG", "total_amount": payload["total_amount"],
                    "total_paid_amount": "0.00", "status": "created", "status_detail": "created",
                    "transactions": {"payments": [], "refunds": []}}
        remote, _ = FakeRemoteOrder.objects.get_or_create(create_key=idempotency_key,
                    defaults={"id": remote_id, "request": payload, "response": response})
        if remote.request != payload:
            raise GatewayError("http_409")
        return RemoteOrder.parse(remote.response)

    def get_order(self, remote_id):
        try:
            return RemoteOrder.parse(FakeRemoteOrder.objects.get(pk=remote_id).response)
        except FakeRemoteOrder.DoesNotExist:
            raise GatewayError("http_404") from None

    def find_order(self, reference, *, begin_date, end_date):
        rows = list(FakeRemoteOrder.objects.filter(response__external_reference=reference)[:2])
        if len(rows) > 1:
            raise GatewayError("search_ambiguous")
        return RemoteOrder.parse(rows[0].response) if rows else None

    @transaction.atomic
    def refund_order(self, remote_id, *, idempotency_key):
        remote = FakeRemoteOrder.objects.select_for_update().get(pk=remote_id)
        if remote.refund_key and str(remote.refund_key) != str(idempotency_key):
            raise GatewayError("http_409")
        remote.refund_key = uuid.UUID(str(idempotency_key))
        remote.save(update_fields=["refund_key"])
        # Deliberately acknowledgement only. simulate_shop_payment confirms it separately.


@transaction.atomic
def simulate(remote_id, state):
    seller_for("fake")
    remote = FakeRemoteOrder.objects.select_for_update().get(pk=remote_id)
    data = copy.deepcopy(remote.response)
    total = data["total_amount"]
    if state == "paid":
        data.update(status="processed", status_detail="accredited", total_paid_amount=total)
        data["transactions"] = {"payments": [{"id": "PAY_" + remote_id, "amount": total, "paid_amount": total,
                                              "status": "processed", "status_detail": "accredited"}], "refunds": []}
    elif state == "refunded":
        if data["total_paid_amount"] != total:
            raise GatewayError("demo_payment_required")
        data.update(status="refunded", status_detail="refunded")
        for payment in data["transactions"]["payments"]:
            payment.update(status="refunded", status_detail="refunded")
        data["transactions"]["refunds"] = [{"id": "REF_" + remote_id, "transaction_id": "PAY_" + remote_id,
                                             "amount": total, "status": "processed"}]
    elif state == "unknown":
        data.update(status="unknown", status_detail="unknown")
    else:
        raise GatewayError("demo_state_invalid")
    remote.response = data
    remote.save(update_fields=["response"])
