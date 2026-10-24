import uuid
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone

from shop.models import Order, Product
from shop.payments.contracts import GatewayError
from shop.payments.fake import FakeGateway, simulate
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
from shop.services import advance_order, request_cancellation, resolve_cancellation
from shop.tests.test_payments import money, observe
from shop.tests.test_shop import buy
from shop.tests.test_shop import domain as shop_domain

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(name="domain")
def reservation_domain(settings):
    settings.SHOP_PAYMENT_PROVIDER = "fake"
    return shop_domain.__wrapped__()


def reject_payment(order, *, remote_known, code="http_401"):
    operation = order.payment_operations.get(kind="RECONCILE" if remote_known else "CREATE")
    finish(claim(operation.pk), error=GatewayError(code))
    order.refresh_from_db()
    assert order.state == "PAYMENT_REVIEW" and not order.payment_confirmed
    return operation


@pytest.mark.parametrize("remote_known", [False, True])
@pytest.mark.parametrize("action", ["expire", "cancel"])
@pytest.mark.parametrize("code", ["http_401", "invalid_response"])
def test_unpaid_review_releases_once_and_preserves_replay(domain, remote_known, action, code):
    order = money(domain) if remote_known else buy(domain, mode="MONEY")[0]
    create = order.payment_operations.get(kind="CREATE")
    key, payload, remote_id = create.external_key, create.payload, order.remote_id
    reject_payment(order, remote_known=remote_known, code=code)
    with patch("django.utils.timezone.now", return_value=order.reserved_until + timedelta(seconds=1)):
        if action == "expire":
            output = StringIO()
            call_command("expire_shop_orders", stdout=output)
            assert "Reservas vencidas: 1" in output.getvalue()
            assert not expire_order(order.pk)
        else:
            cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar revisión sin pago")
            resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Liberar reserva impaga")
            resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Replay")
        replay, created = buy(domain, mode="MONEY")
    assert not created and replay.pk == order.pk
    assert replay.state == ("EXPIRED" if action == "expire" else "CANCELED")
    assert replay.stock_released and not replay.payment_confirmed and replay.remote_id == remote_id
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    create.refresh_from_db()
    assert create.external_key == key and create.payload == payload
    assert order.audit.filter(action="PAYMENT_REVIEW", reason=code).exists()


def test_cancellation_requested_before_failed_create_remains_operable(domain):
    order = buy(domain, mode="MONEY")[0]
    cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
    reject_payment(order, remote_known=False)
    resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Liberar reserva sin pago")
    order.refresh_from_db()
    assert order.state == "CANCELED" and order.stock_released


@pytest.mark.parametrize("action", ["expire", "cancel"])
def test_recovered_create_after_released_review_never_delivers_or_restocks_twice(domain, action):
    order = buy(domain, mode="MONEY")[0]
    operation = reject_payment(order, remote_known=False)
    key = operation.external_key
    with patch("django.utils.timezone.now", return_value=order.reserved_until + timedelta(seconds=1)):
        if action == "expire":
            assert expire_order(order.pk)
        else:
            cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Cancelar")
            resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Liberar")
        retry_operation(domain.admin, operation.pk, reason="Configuración recuperada")
        process_outbox()
        order.refresh_from_db()
        assert order.remote_id and order.stock_released
        observe(order, "paid")
        assert order.state == "PAYMENT_REVIEW" and order.payment_confirmed
        assert Product.objects.get(pk=domain.product.pk).stock == 10
        request_refund(domain.admin, order.pk, reason="Reintegrar pago tardío")
        process_outbox()
        observe(order, "refunded")
        observe(order, "refunded")
        replay, created = buy(domain, mode="MONEY")
    assert not created and replay.pk == order.pk and replay.state == "REFUNDED"
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    assert order.payment_operations.get(kind="CREATE").external_key == key


@pytest.mark.parametrize("prepared", [False, True])
def test_previously_paid_review_never_expires_and_waits_for_refund(domain, prepared):
    order = money(domain)
    observe(order, "paid")
    if prepared:
        advance_order(domain.admin, order.pk, target="READY", reason="Preparar")
    enqueue_reconcile(order.pk)
    finish(claim(order.payment_operations.get(kind="RECONCILE").pk), error=GatewayError("http_401"))
    order.refresh_from_db()
    assert order.state == "PAYMENT_REVIEW" and order.payment_confirmed
    with patch("django.utils.timezone.now", return_value=order.reserved_until + timedelta(days=1)):
        assert not expire_order(order.pk)
        output = StringIO()
        call_command("expire_shop_orders", stdout=output)
        assert "Reservas vencidas: 0" in output.getvalue()
        assert Product.objects.get(pk=domain.product.pk).stock == 9
        cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Revisión de pago")
        resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Reintegrar")
        process_outbox()
        assert not expire_order(order.pk)
        assert Product.objects.get(pk=domain.product.pk).stock == 9
        observe(order, "refunded")
    assert order.state == "REFUNDED" and Product.objects.get(pk=domain.product.pk).stock == 10
    with pytest.raises(DatabaseError), transaction.atomic():
        Order.objects.filter(pk=order.pk).update(payment_confirmed=False)


def test_expiry_never_releases_an_unconfirmed_refund_workflow(domain):
    order = money(domain)
    reject_payment(order, remote_known=True)
    request_refund(domain.admin, order.pk, reason="Resolver manualmente un pago incierto")
    with patch("django.utils.timezone.now", return_value=order.reserved_until + timedelta(days=1)):
        assert not expire_order(order.pk)
        call_command("expire_shop_orders", stdout=StringIO())
    order.refresh_from_db()
    assert order.state == "REFUND_PENDING" and not order.stock_released
    assert Product.objects.get(pk=domain.product.pk).stock == 9


def test_stale_paid_observation_cannot_mark_unpaid_reservation_confirmed(domain):
    order = money(domain)
    simulate(order.remote_id, "paid")
    operation = order.payment_operations.get(kind="RECONCILE")
    stale = claim(operation.pk)
    paid = FakeGateway().get_order(order.remote_id)
    simulate(order.remote_id, "unknown")
    with patch("django.utils.timezone.now", return_value=stale[0].lease_until + timedelta(seconds=1)):
        execute(claim(operation.pk))
        assert not finish(stale, remote=paid)
    order.refresh_from_db()
    assert order.state == "PAYMENT_REVIEW" and not order.payment_confirmed
    with patch("django.utils.timezone.now", return_value=order.reserved_until + timedelta(seconds=1)):
        assert expire_order(order.pk)
        observe(order, "paid")
    assert order.state == "PAYMENT_REVIEW" and order.payment_confirmed and order.stock_released
    assert Product.objects.get(pk=domain.product.pk).stock == 10


def test_pg_disallows_paid_money_without_confirmation(domain):
    order = buy(domain, mode="MONEY")[0]
    with pytest.raises(DatabaseError), transaction.atomic():
        Order.objects.filter(pk=order.pk).update(state="PAID")


def test_confirmation_migration_from_0004_preserves_paid_history_and_unpaid_reservations(domain):
    old_target = [("shop", "0004_payment_contract_guards")]
    new_target = [("shop", "0005_payment_confirmation_history")]
    executor = MigrationExecutor(connection)
    executor.migrate(old_target)
    try:
        old_apps = executor.loader.project_state(old_target).apps
        OldOrder = old_apps.get_model("shop", "Order")
        OldLine = old_apps.get_model("shop", "OrderLine")
        OldKey = old_apps.get_model("shop", "CheckoutKey")
        OldAudit = old_apps.get_model("shop", "OrderAudit")
        cases = [("PAID", None, True), ("READY", None, True), ("PICKED_UP", None, True),
                 ("REFUND_PENDING", None, False), ("REFUNDED", None, True),
                 ("PENDING_PAYMENT", None, False), ("PAYMENT_REVIEW", "http_401", False),
                 ("PAYMENT_REVIEW", "PAID", True), ("PAYMENT_REVIEW", "late_or_reviewed_payment", True)]
        expected = {}
        for state, reason, confirmed in cases:
            with transaction.atomic():
                order = OldOrder.objects.create(id=uuid.uuid4(), customer_id=domain.customer.pk,
                    mode="MONEY", state=state, total_money=domain.product.price_money,
                    pickup_snapshot={"name": "DEMO"}, reserved_until=timezone.now() + timedelta(minutes=15),
                    payment_provider="fake")
                OldLine.objects.create(order=order, product_id=domain.product.pk, name="DEMO", quantity=1,
                                       unit_money=domain.product.price_money)
                OldKey.objects.create(actor_id=domain.customer.pk, key=str(order.pk), fingerprint="synthetic", order=order)
                if reason:
                    OldAudit.objects.create(order=order, action="PAID" if reason == "PAID" else "PAYMENT_REVIEW", reason=reason)
                expected[order.pk] = (state, confirmed)
        MigrationExecutor(connection).migrate(new_target)
        for order in Order.objects.all():
            assert (order.state, order.payment_confirmed) == expected[order.pk]
            assert str(order.total_money) == str(domain.product.price_money)
            assert not order.stock_released
    finally:
        MigrationExecutor(connection).migrate(new_target)
