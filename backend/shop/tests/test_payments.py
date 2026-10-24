import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, connection, transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from credits.models import Wallet, WalletEntry
from credits.services import Conflict
from shop.models import (
    FakeRemoteOrder,
    Order,
    PaymentContext,
    PaymentInbox,
    PaymentOperation,
    Product,
)
from shop.payments.config import gateway_for
from shop.payments.contracts import GatewayError, RemoteOrder
from shop.payments.fake import FakeGateway, simulate
from shop.payments.mercadopago import BASE_URL, MAX_RESPONSE, MercadoPagoGateway, NoRedirect
from shop.payments.observations import financial_state
from shop.payments.processing import (
    claim,
    enqueue_reconcile,
    execute,
    expire_order,
    finish,
    process_outbox,
    request_refund,
    retry_operation,
)
from shop.payments.webhooks import process_inbox
from shop.services import advance_order, request_cancellation, resolve_cancellation
from shop.tests.test_shop import api, buy, parallel
from shop.tests.test_shop import domain as shop_domain

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(name="domain")
def payment_domain():
    return shop_domain.__wrapped__()


@pytest.fixture(autouse=True)
def payment_settings(settings):
    settings.SHOP_PAYMENT_PROVIDER = "fake"
    settings.SHOP_MP_WEBHOOK_SECRET = "synthetic-webhook-secret"


def money(domain):
    order = buy(domain, mode="MONEY")[0]
    process_outbox()
    order.refresh_from_db()
    return order


def observe(order, state):
    simulate(order.remote_id, state)
    enqueue_reconcile(order.pk)
    process_outbox()
    order.refresh_from_db()


def data_for(order=None, *, state="paid"):
    total = format(order.total_money, ".2f") if order else "100.00"
    result = {
        "id": order.remote_id if order and order.remote_id else "ORD_ABC",
        "user_id": "DEMO",
        "external_reference": str(order.pk) if order else "1e38df72-f7f4-41b2-8b0e-057f8c4c682f",
        "currency": "ARS",
        "country_code": "ARG",
        "total_amount": total,
        "total_paid_amount": total,
        "status": "processed",
        "status_detail": "accredited",
        "checkout_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=demo",
        "transactions": {
            "payments": [
                {
                    "id": "PAY_ABC",
                    "amount": total,
                    "paid_amount": total,
                    "status": "processed",
                    "status_detail": "accredited",
                }
            ],
            "refunds": [],
        },
    }
    if state == "refunded":
        result.update(status="refunded", status_detail="refunded")
        result["transactions"]["payments"][0].update(status="refunded", status_detail="refunded")
        result["transactions"]["refunds"] = [
            {"id": "REF_ABC", "transaction_id": "PAY_ABC", "amount": total, "status": "processed"}
        ]
    return result


def signed(
    client, remote_id, *, request_id="request-one", ts=None, body=None, query=None, sign_id=None
):
    ts = ts or str(int(timezone.now().timestamp() * 1000))
    manifest = f"id:{sign_id or remote_id};request-id:{request_id};ts:{ts};"
    signature = hmac.new(b"synthetic-webhook-secret", manifest.encode(), hashlib.sha256).hexdigest()
    return client.post(
        f"/api/v1/shop/payments/webhook/?{query or ('type=order&data.id=' + remote_id)}",
        body if body is not None else {"data": {"id": remote_id}},
        format="json",
        HTTP_X_REQUEST_ID=request_id,
        HTTP_X_SIGNATURE=f"ts={ts},v1={signature}",
    )


def test_adapter_contract_and_no_transaction():
    calls = []

    def send(method, url, headers, payload):
        assert not connection.in_atomic_block
        calls.append((method, url, headers, payload))
        return (201 if method == "POST" and url == BASE_URL else 200), json.dumps(
            data_for()
        ).encode()

    gateway = MercadoPagoGateway("synthetic-token", send=send)
    payload = {"type": "online", "processing_mode": "manual", "total_amount": "100.00"}
    created = gateway.create_order(payload, idempotency_key="create-key")
    assert created.checkout_url.startswith("https://www.mercadopago.com.ar/")
    assert gateway.get_order(created.id).paid == Decimal("100")
    gateway.refund_order(created.id, idempotency_key="refund-key")
    assert calls[0] == (
        "POST",
        BASE_URL,
        {
            "Authorization": "Bearer synthetic-token",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Idempotency-Key": "create-key",
        },
        payload,
    )
    assert calls[1][0:2] == ("GET", BASE_URL + "/ORD_ABC")
    assert calls[2][1] == BASE_URL + "/ORD_ABC/refund" and calls[2][3] == {}
    assert calls[2][2]["X-Idempotency-Key"] == "refund-key"
    with transaction.atomic(), pytest.raises(RuntimeError):
        gateway.get_order("ORD_ABC")
    assert NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.test") is None


@pytest.mark.parametrize(
    "status,retry",
    [
        (400, False),
        (401, False),
        (404, False),
        (409, False),
        (423, True),
        (429, True),
        (500, True),
        (302, False),
    ],
)
def test_adapter_errors_sanitized(status, retry):
    gateway = MercadoPagoGateway(
        "private-token", send=lambda *args: (status, b"secret remote payload")
    )
    with pytest.raises(GatewayError) as caught:
        gateway.get_order("ORD_A")
    assert str(caught.value) == f"http_{status}" and caught.value.retry is retry


@pytest.mark.parametrize("body", [b"invalid json", b"x" * (MAX_RESPONSE + 1), b"[]", b"{}"])
def test_adapter_malformed_bounds(body):
    with pytest.raises(GatewayError):
        MercadoPagoGateway("token", send=lambda *args: (200, body)).get_order("ORD_A")


@pytest.mark.parametrize(
    "url",
    [
        "http://www.mercadopago.com.ar/a",
        "https://evil.test/a",
        "https://www.mercadopago.com.ar.evil.test/",
        "https://user@mercadopago.com.ar/",
        "https://mercadopago.com.ar:444/",
        "https://mercadopago.com.ar:bad/",
    ],
)
def test_checkout_allowlist(url):
    data = data_for()
    data["checkout_url"] = url
    with pytest.raises(GatewayError):
        RemoteOrder.parse(data, creation=True)


def test_search_candidates_get_and_ambiguity():
    calls = []

    def send(method, url, headers, payload):
        calls.append(url)
        result = (
            {"data": [{"id": "ORD_ABC"}], "paging": {"total": 1, "offset": 0, "total_pages": 1}}
            if "?" in url
            else data_for()
        )
        return 200, json.dumps(result).encode()

    gateway = MercadoPagoGateway("token", send=send)
    end = timezone.now()
    assert (
        gateway.find_order("local-ref", begin_date=end - timedelta(days=1), end_date=end).id
        == "ORD_ABC"
    )
    assert (
        "external_reference=local-ref" in calls[0]
        and "begin_date=" in calls[0]
        and calls[1].endswith("/ORD_ABC")
    )
    for total, rows in [(2, [{"id": "A"}, {"id": "B"}]), (1, [])]:
        gateway = MercadoPagoGateway(
            "token",
            send=lambda *args, rows=rows, total=total: (
                200,
                json.dumps(
                    {"data": rows, "paging": {"total": total, "offset": 0, "total_pages": 1}}
                ).encode(),
            ),
        )
        with pytest.raises(GatewayError):
            gateway.find_order("local-ref", begin_date=end - timedelta(days=1), end_date=end)


def test_authoritative_paid_then_unknown_blocks_delivery(domain):
    order = money(domain)
    assert order.state == "PENDING_PAYMENT" and order.checkout_url == ""
    observe(order, "paid")
    assert order.state == "PAID"
    advance_order(domain.admin, order.pk, target="READY", reason="Preparar")
    observe(order, "unknown")
    assert order.state == "PAYMENT_REVIEW"
    with pytest.raises(Conflict):
        advance_order(domain.admin, order.pk, target="PICKED_UP", reason="Retiro")
    observe(order, "paid")
    assert order.state == "PAYMENT_REVIEW"


@pytest.mark.parametrize(
    "field,value",
    [
        ("user_id", "other"),
        ("currency", "USD"),
        ("country_code", "USA"),
        ("total_amount", "1.00"),
        ("external_reference", "other"),
        ("id", "OTHER"),
    ],
)
def test_identity_mismatch_never_authorizes(domain, field, value):
    order = money(domain)
    data = data_for(order)
    data[field] = value
    claimed = claim(order.payment_operations.get(kind="RECONCILE").pk)
    finish(claimed, remote=RemoteOrder.parse(data))
    order.refresh_from_db()
    assert order.state == "PAYMENT_REVIEW"


@pytest.mark.parametrize(
    "mutation",
    [
        "root",
        "partial",
        "overpaid",
        "duplicate",
        "missing",
        "refund_id",
        "refund_amount",
        "refund_status",
        "refund_duplicate",
        "zero_paid",
    ],
)
def test_inconsistent_transactions_fail_closed(mutation):
    data = data_for(
        state="refunded" if mutation.startswith("refund") or mutation == "zero_paid" else "paid"
    )
    if mutation == "root":
        data["status"] = "created"
    if mutation == "partial":
        data["transactions"]["payments"][0]["paid_amount"] = "50.00"
    if mutation == "overpaid":
        data["total_paid_amount"] = "150.00"
    if mutation == "duplicate":
        data["transactions"]["payments"] *= 2
    if mutation == "missing":
        data["transactions"]["payments"] = []
    if mutation == "refund_id":
        data["transactions"]["refunds"][0]["transaction_id"] = "OTHER"
    if mutation == "refund_amount":
        data["transactions"]["refunds"][0]["amount"] = "99.00"
    if mutation == "refund_status":
        data["transactions"]["refunds"][0]["status"] = "pending"
    if mutation == "refund_duplicate":
        data["transactions"]["refunds"] *= 2
    if mutation == "zero_paid":
        data["total_paid_amount"] = "0.00"
    assert financial_state(RemoteOrder.parse(data)) == "review"


def test_expiry_late_payment_refund_once(domain):
    order = money(domain)
    with patch(
        "django.utils.timezone.now", return_value=order.reserved_until + timedelta(seconds=1)
    ):
        assert expire_order(order.pk)
        assert not expire_order(order.pk)
        replay = buy(domain, mode="MONEY")[0]
        assert replay.pk == order.pk and replay.state == "EXPIRED"
    observe(order, "paid")
    assert order.state == "PAYMENT_REVIEW" and order.stock_released
    request_refund(domain.admin, order.pk, reason="Pago tardío")
    process_outbox()
    order.refresh_from_db()
    assert order.state == "REFUND_PENDING"
    observe(order, "refunded")
    assert order.state == "REFUNDED"
    observe(order, "refunded")
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    assert (
        order.payment_operations.get(kind="CREATE").external_key
        != order.payment_operations.get(kind="REFUND").external_key
    )


def test_refund_ack_failure_then_confirm_keeps_inventory(domain):
    order = money(domain)
    observe(order, "paid")
    cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Aprobar")
    refund = order.payment_operations.get(kind="REFUND")
    claimed = claim(refund.pk)
    finish(claimed, error=GatewayError("http_500", retry=True))
    assert Product.objects.get(pk=domain.product.pk).stock == 9
    with pytest.raises(Conflict):
        advance_order(domain.admin, order.pk, target="READY", reason="Preparar")
    PaymentOperation.objects.filter(pk=refund.pk).update(available_at=timezone.now())
    process_outbox()
    order.refresh_from_db()
    assert order.state == "REFUND_PENDING" and not order.stock_released
    observe(order, "refunded")
    assert order.state == "REFUNDED" and Product.objects.get(pk=domain.product.pk).stock == 10
    assert not WalletEntry.objects.filter(kind="REFUND").exists()


def test_refund_after_pickup_is_incident_not_inventory_return(domain):
    order = money(domain)
    observe(order, "paid")
    advance_order(domain.admin, order.pk, target="READY", reason="Preparar")
    advance_order(domain.admin, order.pk, target="PICKED_UP", reason="Entregar")
    observe(order, "refunded")
    assert order.state == "PICKED_UP" and not order.stock_released
    assert Product.objects.get(pk=domain.product.pk).stock == 9
    assert order.audit.filter(reason="financial_change_after_pickup").exists()
    with pytest.raises(Conflict):
        request_refund(domain.admin, order.pk, reason="Tarde")


def test_duplicate_workers_and_crash_fencing(domain):
    order = buy(domain, mode="MONEY")[0]
    operation = order.payment_operations.get(kind="CREATE")
    claims = parallel(lambda: claim(operation.pk), lambda: claim(operation.pk))
    assert sum(c is not None for c in claims) == 1
    old = next(c for c in claims if c is not None)
    remote = FakeGateway().create_order(old[2].request, idempotency_key=str(operation.external_key))
    with patch("django.utils.timezone.now", return_value=old[0].lease_until + timedelta(seconds=1)):
        fresh = claim(operation.pk)
        execute(fresh)
        assert not finish(old, remote=remote)
    order.refresh_from_db()
    assert order.remote_id == remote.id and FakeRemoteOrder.objects.count() == 1
    assert Product.objects.get(pk=domain.product.pk).stock == 9


def test_cross_operation_fence_and_terminal_monotonicity(domain):
    order = money(domain)
    simulate(order.remote_id, "paid")
    old = claim(order.payment_operations.get(kind="RECONCILE").pk)
    old_paid = FakeGateway().get_order(order.remote_id)
    # First claim expires, another worker observes refund and commits a newer generation.
    simulate(order.remote_id, "refunded")
    with patch("django.utils.timezone.now", return_value=old[0].lease_until + timedelta(seconds=1)):
        fresh = claim(old[0].pk)
        execute(fresh)
        assert not finish(old, remote=old_paid)
    order.refresh_from_db()
    assert order.state == "REFUNDED" and Product.objects.get(pk=domain.product.pk).stock == 10
    enqueue_reconcile(order.pk)
    finish(claim(old[0].pk), remote=old_paid)
    order.refresh_from_db()
    assert order.state == "REFUNDED"


@pytest.mark.parametrize("action", ["cancel", "expire"])
def test_inflight_paid_rechecks_release(domain, action):
    order = money(domain)
    simulate(order.remote_id, "paid")
    claimed = claim(order.payment_operations.get(kind="RECONCILE").pk)
    remote = FakeGateway().get_order(order.remote_id)
    if action == "cancel":
        request = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
        resolve_cancellation(domain.admin, request.pk, approve=True, reason="Aprobar")
        finish(claimed, remote=remote)
    else:
        with patch(
            "django.utils.timezone.now", return_value=order.reserved_until + timedelta(seconds=1)
        ):
            expire_order(order.pk)
            assert not finish(claimed, remote=remote)  # expired lease too
        enqueue_reconcile(order.pk)
        PaymentOperation.objects.filter(pk=claimed[0].pk).update(
            lease_until=timezone.now() - timedelta(seconds=1)
        )
        execute(claim(claimed[0].pk))
    order.refresh_from_db()
    assert order.state == "PAYMENT_REVIEW" and order.stock_released
    assert Product.objects.get(pk=domain.product.pk).stock == 10


def test_timeout_recovery_by_search_without_webhook(domain):
    order = buy(domain, mode="MONEY")[0]
    operation = order.payment_operations.get(kind="CREATE")

    class TimedOut(FakeGateway):
        def create_order(self, payload, *, idempotency_key):
            super().create_order(payload, idempotency_key=idempotency_key)
            raise GatewayError("transport_unknown", retry=True)

    execute(claim(operation.pk), gateway=TimedOut())
    order.refresh_from_db()
    assert not order.remote_id
    old_key = operation.external_key
    PaymentOperation.objects.filter(pk=operation.pk).update(available_at=timezone.now())

    class SearchOnly(FakeGateway):
        def create_order(self, *args, **kwargs):
            pytest.fail("Search must recover the existing order without another POST")

    execute(claim(operation.pk), gateway=SearchOnly())
    order.refresh_from_db()
    assert order.remote_id and FakeRemoteOrder.objects.count() == 1
    assert order.payment_operations.get(kind="CREATE").external_key == old_key


def test_409_search_recovery_and_ambiguous_review(domain):
    order = buy(domain, mode="MONEY")[0]

    class ConflictGateway(FakeGateway):
        def create_order(self, payload, *, idempotency_key):
            super().create_order(payload, idempotency_key=idempotency_key)
            raise GatewayError("http_409")

    process_outbox(gateway=ConflictGateway())
    order.refresh_from_db()
    assert order.remote_id
    other = buy(domain, mode="MONEY", key="other")[0]

    class AmbiguousGateway(ConflictGateway):
        def find_order(self, *args, **kwargs):
            raise GatewayError("search_ambiguous")

    process_outbox(gateway=AmbiguousGateway())
    other.refresh_from_db()
    assert other.state == "PAYMENT_REVIEW" and not other.remote_id


@pytest.mark.parametrize("ts_size", [10, 13])
def test_webhook_literal_signature_dedupe_and_bounds(ts_size):
    ts = str(int(timezone.now().timestamp() * (1000 if ts_size == 13 else 1)))
    assert signed(api(), "ORD_UPPER", ts=ts).status_code == 200
    assert signed(api(), "ORD_UPPER", ts=ts).status_code == 200
    assert PaymentInbox.objects.count() == 1
    assert signed(api(), "ORD_UPPER", sign_id="ord_upper").status_code == 401
    assert signed(api(), "ORD_UPPER", body={"data": {"id": "OTHER"}}).status_code == 401
    assert (
        signed(
            api(), "ORD_UPPER", query="type=order&data.id=ORD_UPPER&data.id=ORD_UPPER"
        ).status_code
        == 401
    )
    assert (
        signed(api(), "ORD_UPPER", ts=str(int(timezone.now().timestamp()) - 601)).status_code == 401
    )
    assert (
        signed(api(), "ORD_UPPER", ts=str(int(timezone.now().timestamp()) + 61)).status_code == 401
    )
    assert (
        signed(
            api(), "ORD_UPPER", body={"data": {"id": "ORD_UPPER"}, "padding": "x" * 9000}
        ).status_code
        == 401
    )


def test_early_webhook_paid_then_refunded_same_remote_id(domain):
    with override_settings(
        SHOP_PAYMENT_PROVIDER="mercadopago",
        SHOP_MP_SANDBOX_VERIFIED=True,
        SHOP_MP_ACCESS_TOKEN="synthetic",
        SHOP_MP_SELLER_ID="DEMO",
    ):
        order = buy(domain, mode="MONEY")[0]
    remote_data = data_for(order)

    class Remote:
        def get_order(self, remote_id):
            assert not connection.in_atomic_block
            return RemoteOrder.parse(remote_data)

    assert signed(api(), "ORD_ABC").status_code == 200
    process_inbox(gateway=Remote())
    order.refresh_from_db()
    assert order.remote_id == "ORD_ABC" and order.state == "PENDING_PAYMENT"
    assert PaymentInbox.objects.get().done
    process_outbox(gateway=Remote())
    order.refresh_from_db()
    assert order.state == "PAID"
    remote_data = data_for(order, state="refunded")
    assert signed(api(), "ORD_ABC", request_id="second-delivery").status_code == 200
    process_inbox(gateway=Remote())
    process_outbox(gateway=Remote())
    order.refresh_from_db()
    assert order.state == "REFUNDED" and PaymentInbox.objects.count() == 2


def test_unlinked_inbox_retained_and_payload_cannot_authorize():
    assert (
        signed(api(), "ORD_ABC", body={"data": {"id": "ORD_ABC", "status": "approved"}}).status_code
        == 200
    )

    class Remote:
        def get_order(self, remote_id):
            return RemoteOrder.parse(data_for())

    process_inbox(gateway=Remote())
    row = PaymentInbox.objects.get()
    assert not row.done and row.last_code == "inbox_unlinked" and row.attempts == 1


def test_contract_immutable_and_admin_retry(domain):
    order = buy(domain, mode="MONEY")[0]
    context = PaymentContext.objects.get(order=order)
    for update in [{"seller": "evil"}, {"request": {}}]:
        with pytest.raises(DatabaseError), transaction.atomic():
            PaymentContext.objects.filter(pk=order.pk).update(**update)
    op = order.payment_operations.get(kind="CREATE")
    finish(claim(op.pk), error=GatewayError("http_401"))
    with pytest.raises(PermissionDenied):
        retry_operation(domain.customer, op.pk, reason="No autorizado")
    retry_operation(domain.admin, op.pk, reason="Configuración corregida")
    op.refresh_from_db()
    assert (
        op.state == "PENDING" and PaymentContext.objects.get(order=order).request == context.request
    )
    assert order.audit.filter(action="PAYMENT_RETRY", actor=domain.admin).exists()


def test_commands_seed_idempotence_and_demo_receipts(domain, tmp_path):
    destination = tmp_path / "receipts.local.txt"
    with override_settings(DEBUG=True):
        for _ in range(2):
            call_command(
                "seed_shop_demo",
                "--customer",
                str(domain.customer.pk),
                "--administrator",
                str(domain.admin.pk),
                "--receipts",
                str(destination),
                stdout=StringIO(),
            )
        assert Order.objects.count() == 2
        assert Wallet.objects.get(tourist=domain.customer).balance == 1400
        assert Product.objects.get(demo=True).stock == 18
        assert destination.read_text().startswith("DEMO — SIN VALIDEZ FISCAL")
        call_command("process_shop_outbox", stdout=StringIO())
        order = Order.objects.get(mode="MONEY")
        call_command("simulate_shop_payment", str(order.pk), "paid", stdout=StringIO())
        call_command("process_shop_outbox", stdout=StringIO())
        call_command("reconcile_shop_orders", stdout=StringIO())
        call_command("expire_shop_orders", stdout=StringIO())
        order.refresh_from_db()
        assert order.state == "PAID"
    with pytest.raises(CommandError):
        call_command(
            "seed_shop_demo",
            customer=domain.customer.pk,
            administrator=domain.admin.pk,
            receipts=str(destination),
        )
    with override_settings(SHOP_ALLOW_TEST_FAKE=False), pytest.raises(GatewayError):
        FakeGateway()


def test_refund_claim_fences_older_reconcile_across_kinds(domain):
    order = money(domain)
    observe(order, "paid")
    enqueue_reconcile(order.pk)
    old = claim(order.payment_operations.get(kind="RECONCILE").pk)
    old_paid = FakeGateway().get_order(order.remote_id)
    cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Aprobar")
    refund = order.payment_operations.get(kind="REFUND")
    assert claim(refund.pk) is None
    simulate(order.remote_id, "refunded")
    with patch("django.utils.timezone.now", return_value=old[0].lease_until + timedelta(seconds=1)):
        newer = claim(refund.pk)
        assert newer[2].version > old[2].version
        execute(newer)
        assert not finish(old, remote=old_paid)
    order.refresh_from_db()
    assert order.state == "REFUNDED" and Product.objects.get(pk=domain.product.pk).stock == 10


def test_disabled_configuration_blocks_worker_and_seller_change(domain):
    order = buy(domain, mode="MONEY")[0]
    with override_settings(SHOP_PAYMENT_PROVIDER="disabled"), pytest.raises(GatewayError):
        gateway_for("fake")
    with override_settings(SHOP_PAYMENT_PROVIDER="mercadopago", SHOP_MP_SANDBOX_VERIFIED=True,
                           SHOP_MP_ACCESS_TOKEN="synthetic", SHOP_MP_SELLER_ID="ORIGINAL"):
        other = buy(domain, mode="MONEY", key="real-config-test")[0]
    with override_settings(SHOP_MP_SELLER_ID="CHANGED", SHOP_MP_SANDBOX_VERIFIED=True,
                           SHOP_MP_ACCESS_TOKEN="synthetic"):
        execute(claim(other.payment_operations.get(kind="CREATE").pk))
    assert other.payment_operations.get(kind="CREATE").last_code == "seller_configuration_changed"
    assert not FakeRemoteOrder.objects.exists()
    assert order.state == "PENDING_PAYMENT"


def test_reconcile_network_error_blocks_prepared_order(domain):
    order = money(domain)
    observe(order, "paid")
    advance_order(domain.admin, order.pk, target="READY", reason="Preparar")
    enqueue_reconcile(order.pk)
    finish(claim(order.payment_operations.get(kind="RECONCILE").pk), error=GatewayError("transport_unknown", retry=True))
    order.refresh_from_db()
    assert order.state == "PAYMENT_REVIEW" and not order.stock_released
    with pytest.raises(Conflict):
        advance_order(domain.admin, order.pk, target="PICKED_UP", reason="Retirar")
