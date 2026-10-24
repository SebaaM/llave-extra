import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from threading import Barrier
from types import SimpleNamespace

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, close_old_connections, connection, connections, transaction
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import APIException
from rest_framework.test import APIClient

from accounts.models import User
from credits.models import Wallet, WalletEntry
from credits.services import Conflict, credit_wallet
from shop.admin import OrderAdmin, ProductAdmin
from shop.models import (
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
from shop.services import (
    adjust_stock,
    advance_order,
    checkout,
    locked_order,
    release_stock,
    request_cancellation,
    resolve_cancellation,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def domain():
    customer = User.objects.create_user("buyer@example.test", email_verified=True)
    other = User.objects.create_user("other@example.test", email_verified=True)
    admin = User.objects.create_superuser("admin@example.test")
    for user in (customer, other):
        with transaction.atomic():
            credit_wallet(user.pk, 1000, f"fixture:{user.pk}")
    product = Product.objects.create(name="Llavero", active=True, stock=10, price_money="2500.25", price_credits=100)
    ShopSettings.objects.create(pickup_enabled=True, pickup_name="Punto", pickup_address="Calle 123", pickup_hours="9 a 18")
    return SimpleNamespace(customer=customer, other=other, admin=admin, product=product)


def buy(domain, *, user=None, key="one", mode="CREDITS", items=None):
    return checkout((user or domain.customer).pk, mode=mode, idempotency_key=key,
                    items=items or [{"product_id": str(domain.product.pk), "quantity": 1}])


def api(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


def parallel(*calls):
    barrier = Barrier(len(calls))

    def run(call):
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '8s'")
                cursor.execute("SET statement_timeout = '15s'")
            barrier.wait(timeout=10)
            try:
                return call()
            except APIException as exc:
                return exc.status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(run, call) for call in calls]
        return [future.result(timeout=25) for future in futures]


def test_credit_snapshots_replay_and_rollback(domain):
    order, created = buy(domain)
    assert created and order.state == "PAID" and order.total_credits == 100
    assert Wallet.objects.get(tourist=domain.customer).balance == 900
    assert Product.objects.get(pk=domain.product.pk).stock == 9
    Product.objects.filter(pk=domain.product.pk).update(name="Nuevo", price_credits=300)
    ShopSettings.objects.filter(pk=1).update(pickup_address="Otra dirección", pickup_enabled=False)
    replay, created = buy(domain)
    assert replay.pk == order.pk and not created
    assert replay.lines.get().name == "Llavero" and replay.lines.get().unit_credits == 100
    assert replay.pickup_snapshot["address"] == "Calle 123"
    with pytest.raises(Conflict):
        buy(domain, items=[{"product_id": str(domain.product.pk), "quantity": 2}])
    assert Order.objects.count() == 1


@pytest.mark.parametrize("frozen,balance", [(False, 50), (True, 1000)])
def test_wallet_failure_rolls_back(domain, frozen, balance):
    Wallet.objects.filter(tourist=domain.customer).update(balance=balance, redemptions_frozen=frozen)
    with pytest.raises(APIException):
        buy(domain)
    assert not Order.objects.exists() and not CheckoutKey.objects.exists()
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    assert Wallet.objects.get(tourist=domain.customer).balance == balance
    assert not WalletEntry.objects.filter(kind="REDEEM").exists()


@pytest.mark.parametrize("role", ["PROVIDER", "COLLABORATOR", "ADMIN"])
def test_roles_cannot_buy(domain, role):
    user = User.objects.create_user(f"role-{role}@example.test", role=role, email_verified=True)
    response = api(user).post("/api/v1/shop/orders/", {"mode": "CREDITS", "items": [{"product_id": str(domain.product.pk), "quantity": 1}]}, format="json", HTTP_IDEMPOTENCY_KEY="role")
    assert response.status_code == 403
    assert api(user).get("/api/v1/shop/orders/").status_code == 403
    assert not Order.objects.exists()


@pytest.mark.parametrize("field,value", [("email_verified", False), ("is_active", False)])
def test_ineligible_customer(domain, field, value):
    User.objects.filter(pk=domain.customer.pk).update(**{field: value})
    with pytest.raises(APIException):
        buy(domain)
    assert not Order.objects.exists()


@pytest.mark.parametrize("extra", [{"total_money": "1.00"}, {"currency": "USD"}, {"customer_id": 1}, {"state": "PAID"}])
def test_api_rejects_tampering(domain, extra):
    data = {"mode": "CREDITS", "items": [{"product_id": str(domain.product.pk), "quantity": 1}], **extra}
    assert api(domain.customer).post("/api/v1/shop/orders/", data, format="json", HTTP_IDEMPOTENCY_KEY="key").status_code == 400
    assert not Order.objects.exists()


@pytest.mark.parametrize("quantity", [True, "1", 1.0, 0, -1, 100])
def test_quantity_strict(domain, quantity):
    data = {"mode": "CREDITS", "items": [{"product_id": str(domain.product.pk), "quantity": quantity}]}
    assert api(domain.customer).post("/api/v1/shop/orders/", data, format="json", HTTP_IDEMPOTENCY_KEY="key").status_code == 400


def test_cart_limits_and_unknown_line_fields(domain):
    line = {"product_id": str(domain.product.pk), "quantity": 1}
    for items in ([], [line, line], [line] * 21, [{**line, "unit_credits": 1}]):
        with pytest.raises(APIException):
            checkout(domain.customer.pk, mode="CREDITS", items=items, idempotency_key="key")
    for key in ("", "a b", "x" * 129):
        with pytest.raises(APIException):
            buy(domain, key=key)


def test_idor_api_and_successful_replay(domain):
    client = api(domain.customer)
    data = {"mode": "CREDITS", "items": [{"product_id": str(domain.product.pk), "quantity": 1}]}
    response = client.post("/api/v1/shop/orders/", data, format="json", HTTP_IDEMPOTENCY_KEY="key")
    assert response.status_code == 201
    assert client.post("/api/v1/shop/orders/", data, format="json", HTTP_IDEMPOTENCY_KEY="key").status_code == 200
    pk = response.data["id"]
    outsider = api(domain.other)
    assert outsider.get(f"/api/v1/shop/orders/{pk}/").status_code == 404
    assert outsider.post(f"/api/v1/shop/orders/{pk}/cancel/", {"reason": "Cancelar"}, format="json").status_code == 404
    assert outsider.get("/api/v1/shop/orders/").data["count"] == 0
    assert api().get(f"/api/v1/shop/orders/{pk}/").status_code == 401


def test_public_catalog_media_revalidated(domain, tmp_path):
    image = BytesIO()
    Image.new("RGB", (8, 8), "red").save(image, "PNG")
    with override_settings(PRIVATE_MEDIA_ROOT=tmp_path):
        domain.product.image.save("test.png", SimpleUploadedFile("test.png", image.getvalue(), content_type="image/png"))
    result = api().get("/api/v1/shop/products/")
    assert result.status_code == 200 and result.data["count"] == 1
    assert set(result.data["results"][0]) == {"id", "name", "description", "stock", "price_money", "price_credits", "image_url"}
    url = result.data["results"][0]["image_url"]
    response = api().get(url)
    assert response.status_code == 200 and response["Cache-Control"] == "no-store"
    response.close()
    Product.objects.filter(pk=domain.product.pk).update(active=False)
    assert api().get(url).status_code == 404
    assert api().get("/api/v1/shop/products/").data["count"] == 0


def test_image_validation(domain):
    from django.core.exceptions import ValidationError
    domain.product.image = SimpleUploadedFile("fake.png", b"not-an-image", content_type="image/png")
    with pytest.raises(ValidationError):
        domain.product.full_clean()


def test_admin_can_preview_inactive_image_only_with_session(domain):
    image = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(image, "PNG")
    domain.product.image.save("admin.png", SimpleUploadedFile("admin.png", image.getvalue()))
    Product.objects.filter(pk=domain.product.pk).update(active=False)
    url = domain.product.image.url
    assert api().get(url).status_code in (401, 403)
    client = APIClient()
    client.force_login(domain.customer)
    assert client.get(url).status_code == 403
    client.force_login(domain.admin)
    response = client.get(url)
    assert response.status_code == 200 and response["Cache-Control"] == "no-store"
    response.close()


def test_production_rejects_fake():
    env = os.environ.copy()
    env.update(DJANGO_SECRET_KEY="a" * 60, JWT_SIGNING_KEY="b" * 60, QR_SIGNING_KEY="c" * 60,
               DJANGO_ALLOWED_HOSTS="example.test", SHOP_PAYMENT_PROVIDER="fake")
    result = subprocess.run([sys.executable, "-c", "import config.settings.prod"],
                            capture_output=True, text=True, check=False, env=env)
    assert result.returncode != 0 and "simulador de pagos" in result.stderr


@override_settings(SHOP_PAYMENT_PROVIDER="fake")
def test_money_reservation_payload_replay_after_expiry(domain):
    order, _ = buy(domain, mode="MONEY")
    assert order.state == "PENDING_PAYMENT" and order.total_money == Decimal("2500.25")
    assert timedelta(minutes=14, seconds=59) < order.reserved_until - order.created_at <= timedelta(minutes=15)
    operation = order.payment_operations.get()
    assert operation.payload["total_amount"] == "2500.25" and operation.kind == "CREATE"
    assert Wallet.objects.get(tourist=domain.customer).balance == 1000
    with transaction.atomic():
        _, current = locked_order(order.pk)
        current.state = "EXPIRED"
        release_stock(current)
        current.save(update_fields=["state", "stock_released"])
    with override_settings(SHOP_PAYMENT_PROVIDER="disabled"):
        replay, created = buy(domain, mode="MONEY")
    assert not created and replay.state == "EXPIRED" and replay.stock_released
    assert PaymentOperation.objects.get().external_key == operation.external_key
    assert Product.objects.get(pk=domain.product.pk).stock == 10


@pytest.mark.parametrize("provider", ["disabled", "mercadopago"])
def test_unconfigured_money_blocks(domain, provider):
    with override_settings(SHOP_PAYMENT_PROVIDER=provider), pytest.raises(Conflict):
        buy(domain, mode="MONEY")
    assert not Order.objects.exists() and not PaymentOperation.objects.exists()


def test_missing_pickup_and_unavailable_mode(domain):
    Product.objects.filter(pk=domain.product.pk).update(price_credits=None)
    with pytest.raises(Conflict):
        buy(domain)
    ShopSettings.objects.all().delete()
    with pytest.raises(Conflict):
        buy(domain)
    assert not Order.objects.exists()


def test_cancel_refund_once_and_pickup_gate(domain):
    order, _ = buy(domain)
    advance_order(domain.admin, order.pk, target="READY", reason="Listo")
    request = request_cancellation(domain.customer.pk, order.pk, reason="No puedo retirar")
    assert request_cancellation(domain.customer.pk, order.pk, reason="Reintento").pk == request.pk
    with pytest.raises(Conflict):
        advance_order(domain.admin, order.pk, target="PICKED_UP", reason="Entrega")
    resolve_cancellation(domain.admin, request.pk, approve=True, reason="Aprobado")
    resolve_cancellation(domain.admin, request.pk, approve=True, reason="Reintento")
    assert Wallet.objects.get(tourist=domain.customer).balance == 1000
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    assert WalletEntry.objects.filter(kind="REFUND").count() == 1
    assert Order.objects.get().state == "CANCELED"
    assert CancellationRequest.objects.get().state == "APPROVED"
    assert buy(domain)[0].state == "CANCELED"


def test_reject_and_deliver_and_authorize_actions(domain):
    order, _ = buy(domain)
    request = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    with pytest.raises(APIException):
        resolve_cancellation(domain.customer, request.pk, approve=True, reason="Intento")
    resolve_cancellation(domain.admin, request.pk, approve=False, reason="Ya preparado")
    advance_order(domain.admin, order.pk, target="READY", reason="Listo")
    advance_order(domain.admin, order.pk, target="PICKED_UP", reason="Entregado")
    with pytest.raises(Conflict):
        request_cancellation(domain.customer.pk, order.pk, reason="Tarde")
    with pytest.raises(APIException):
        advance_order(domain.admin, order.pk, target="PAID", reason="Manual")


@override_settings(SHOP_PAYMENT_PROVIDER="fake")
def test_pending_money_cancellation_releases_without_confirming_payment(domain):
    order, _ = buy(domain, mode="MONEY")
    request = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    resolve_cancellation(domain.admin, request.pk, approve=True, reason="Aprobado")
    with pytest.raises(Conflict):
        advance_order(domain.admin, order.pk, target="READY", reason="Preparar")
    assert Order.objects.get().state == "CANCELED"
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    assert CancellationRequest.objects.get().state == "APPROVED"


def test_pg_history_and_constraints(domain):
    order, _ = buy(domain)
    for queryset, data in ((Order.objects.filter(pk=order.pk), {"total_credits": 1}),
                           (Order.objects.filter(pk=order.pk), {"pickup_snapshot": {}}),
                           (OrderLine.objects.all(), {"quantity": 2}),
                           (CheckoutKey.objects.all(), {"fingerprint": "x"}),
                           (OrderAudit.objects.all(), {"reason": "Reescrito"}),
                           (Product.objects.all(), {"stock": -1}),
                           (Product.objects.all(), {"price_credits": 0})):
        with pytest.raises(DatabaseError), transaction.atomic():
            queryset.update(**data)
    with pytest.raises(DatabaseError), transaction.atomic():
        Order.objects.filter(pk=order.pk).delete()
    with pytest.raises(DatabaseError), transaction.atomic():
        OrderLine.objects.create(order=order, product=Product.objects.create(name="Otro", price_credits=1), name="Extra", quantity=1, unit_credits=1)
    with pytest.raises(DatabaseError), transaction.atomic():
        Order.objects.create(customer=domain.customer, mode="CREDITS", state="PAID", total_credits=1, pickup_snapshot={})


@override_settings(SHOP_PAYMENT_PROVIDER="fake")
def test_outbox_payload_immutable(domain):
    buy(domain, mode="MONEY")
    for data in ({"payload": {}}, {"kind": "REFUND"}, {"external_key": "00000000-0000-0000-0000-000000000000"}):
        with pytest.raises(DatabaseError), transaction.atomic():
            PaymentOperation.objects.update(**data)
    PaymentOperation.objects.update(generation=1, attempts=1, state="RUNNING", lease_until=timezone.now())
    with pytest.raises(DatabaseError), transaction.atomic():
        PaymentOperation.objects.update(generation=0)


def test_admin_readonly_delta_and_stale_form(domain):
    site = AdminSite()
    request = SimpleNamespace(user=domain.admin)
    order_admin = OrderAdmin(Order, site)
    assert not order_admin.has_add_permission(request)
    assert not order_admin.has_change_permission(request)
    assert not order_admin.has_delete_permission(request)
    product_admin = ProductAdmin(Product, site)
    assert "stock" in product_admin.readonly_fields
    stale = Product.objects.get(pk=domain.product.pk)
    buy(domain)
    stale.name = "Edición"
    product_admin.save_model(request, stale, None, True)
    assert Product.objects.get(pk=stale.pk).stock == 9
    adjustment = adjust_stock(domain.admin, stale.pk, delta=3, reason="Reposición")
    assert adjustment.resulting_stock == 12
    with pytest.raises(Conflict):
        adjust_stock(domain.admin, stale.pk, delta=-13, reason="Error")
    with pytest.raises(DatabaseError), transaction.atomic():
        StockAdjustment.objects.update(delta=99)


def test_parallel_same_key_one_debit(domain):
    results = parallel(lambda: buy(domain), lambda: buy(domain))
    assert sorted(created for _, created in results) == [False, True]
    assert Order.objects.count() == 1 and CheckoutKey.objects.count() == 1
    assert WalletEntry.objects.filter(kind="REDEEM").count() == 1
    assert Product.objects.get(pk=domain.product.pk).stock == 9


@override_settings(SHOP_PAYMENT_PROVIDER="fake")
def test_parallel_same_key_money_one_outbox(domain):
    results = parallel(lambda: buy(domain, mode="MONEY"), lambda: buy(domain, mode="MONEY"))
    assert sorted(created for _, created in results) == [False, True]
    assert PaymentOperation.objects.count() == 1 and Order.objects.count() == 1


def test_parallel_last_stock(domain):
    Product.objects.filter(pk=domain.product.pk).update(stock=1)
    results = parallel(lambda: buy(domain), lambda: buy(domain, user=domain.other))
    assert sum(isinstance(result, tuple) for result in results) == 1
    assert 409 in results and Order.objects.count() == 1
    assert Product.objects.get(pk=domain.product.pk).stock == 0


def test_parallel_last_credits(domain):
    Wallet.objects.filter(tourist=domain.customer).update(balance=100)
    results = parallel(lambda: buy(domain, key="first"), lambda: buy(domain, key="second"))
    assert sum(isinstance(result, tuple) for result in results) == 1
    assert Wallet.objects.get(tourist=domain.customer).balance == 0
    assert Order.objects.count() == 1


def test_parallel_reverse_carts(domain):
    second = Product.objects.create(name="Segundo", active=True, stock=3, price_credits=100)
    first = {"product_id": str(domain.product.pk), "quantity": 1}
    last = {"product_id": str(second.pk), "quantity": 1}
    results = parallel(lambda: buy(domain, items=[first, last]),
                       lambda: buy(domain, user=domain.other, items=[last, first]))
    assert all(created for _, created in results) and Order.objects.count() == 2
    assert Product.objects.get(pk=second.pk).stock == 1
    assert buy(domain, items=[last, first])[1] is False


def test_parallel_delta_and_checkout(domain):
    results = parallel(lambda: buy(domain),
                       lambda: adjust_stock(domain.admin, domain.product.pk, delta=5, reason="Reposición"))
    assert all(not isinstance(result, int) for result in results)
    assert Product.objects.get(pk=domain.product.pk).stock == 14
    assert StockAdjustment.objects.count() == 1 and Order.objects.count() == 1


def test_parallel_cancel_refund_once(domain):
    order, _ = buy(domain)
    request = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    parallel(lambda: resolve_cancellation(domain.admin, request.pk, approve=True, reason="Aprobado"),
             lambda: resolve_cancellation(domain.admin, request.pk, approve=True, reason="Aprobado"))
    assert WalletEntry.objects.filter(kind="REFUND").count() == 1
    assert Product.objects.get(pk=domain.product.pk).stock == 10


def test_future_prices_and_frozen_refund(domain):
    order, _ = buy(domain)
    Product.objects.filter(pk=domain.product.pk).update(name="Nuevo", price_credits=200)
    future, _ = buy(domain, key="future")
    assert future.total_credits == 200 and future.lines.get().name == "Nuevo"
    assert order.lines.get().name == "Llavero" and order.total_credits == 100
    Wallet.objects.filter(tourist=domain.customer).update(redemptions_frozen=True)
    request = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    resolve_cancellation(domain.admin, request.pk, approve=True, reason="Aprobado")
    assert Wallet.objects.get(tourist=domain.customer).balance == 800


@override_settings(SHOP_PAYMENT_PROVIDER="fake")
def test_failed_refund_still_blocks_delivery(domain):
    order, _ = buy(domain, mode="MONEY")
    # Simulates Task 2 authoritative payment application; no API/Admin grants this state.
    Order.objects.filter(pk=order.pk).update(state="PAID", payment_confirmed=True)
    PaymentOperation.objects.create(order=order, kind="REFUND", payload={}, state="BLOCKED")
    with pytest.raises(Conflict):
        advance_order(domain.admin, order.pk, target="READY", reason="Preparar")


def test_parallel_cancellation_and_pickup(domain):
    order, _ = buy(domain)
    advance_order(domain.admin, order.pk, target="READY", reason="Listo")
    results = parallel(lambda: request_cancellation(domain.customer.pk, order.pk, reason="Cancelar"),
                       lambda: advance_order(domain.admin, order.pk, target="PICKED_UP", reason="Entrega"))
    assert sum(result == 409 for result in results) == 1
    order.refresh_from_db()
    assert (order.state == "PICKED_UP") != order.cancellations.filter(state="OPEN").exists()
