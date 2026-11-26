from contextlib import ExitStack
from copy import deepcopy
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import override_settings

from credits.models import Wallet
from shop.management.commands import (
    expire_shop_orders,
    process_shop_outbox,
    reconcile_shop_orders,
    run_shop_scheduler_lab,
)
from shop.models import Order, PaymentOperation, Product
from shop.payments.fake import simulate
from shop.payments.processing import enqueue_reconcile
from shop.services import request_cancellation, resolve_cancellation
from shop.tests.test_payments import money, observe
from shop.tests.test_shop import buy
from shop.tests.test_shop import domain as shop_domain

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(name="domain")
def scheduler_domain():
    return shop_domain.__wrapped__()


@pytest.fixture
def scheduler_lab(monkeypatch, settings):
    settings.SHOP_PAYMENT_PROVIDER = "fake"
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_ENABLED", "true")
    # The test fixture binds the guard to this disposable PostgreSQL test database.
    database_name = connection.settings_dict["NAME"]
    database_host = connection.settings_dict["HOST"]
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_DATABASE_NAME", database_name)
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_DATABASE_HOST", database_host)
    monkeypatch.setattr(run_shop_scheduler_lab, "ALLOWED_LAB_DATABASE_NAMES", frozenset({database_name}))
    monkeypatch.setattr(run_shop_scheduler_lab, "ALLOWED_LAB_DATABASE_HOSTS", frozenset({database_host}))


def test_scheduler_lab_rejects_non_fake_settings_before_any_worker(scheduler_lab):
    output = StringIO()
    workers = (process_shop_outbox, expire_shop_orders, reconcile_shop_orders)

    with ExitStack() as stack:
        spies = [stack.enter_context(patch.object(module.Command, "handle")) for module in workers]
        with override_settings(SHOP_PAYMENT_PROVIDER="disabled"):
            with pytest.raises(CommandError, match="SHOP_PAYMENT_PROVIDER=fake"):
                call_command("run_shop_scheduler_lab", "--once", stdout=output)

    assert all(not spy.called for spy in spies)
    assert output.getvalue() == ""


def test_scheduler_lab_rejects_matching_but_unapproved_database_identity(monkeypatch):
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_ENABLED", "true")
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_DATABASE_NAME", connection.settings_dict["NAME"])
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_DATABASE_HOST", connection.settings_dict["HOST"])

    with patch.object(run_shop_scheduler_lab.Command, "_run") as run:
        with override_settings(
            DEBUG=True,
            SHOP_ALLOW_TEST_FAKE=False,
            SHOP_PAYMENT_PROVIDER="fake",
        ):
            with pytest.raises(CommandError, match="identidad PostgreSQL exacta"):
                call_command("run_shop_scheduler_lab", "--once")

    run.assert_not_called()


def test_test_fake_permission_does_not_bypass_database_allowlist(monkeypatch):
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_ENABLED", "true")
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_DATABASE_NAME", connection.settings_dict["NAME"])
    monkeypatch.setenv("SHOP_SCHEDULER_LAB_DATABASE_HOST", connection.settings_dict["HOST"])

    with patch.object(run_shop_scheduler_lab.Command, "_run") as run:
        with override_settings(
            DEBUG=True,
            SHOP_ALLOW_TEST_FAKE=True,
            SHOP_PAYMENT_PROVIDER="fake",
        ):
            with pytest.raises(CommandError, match="identidad PostgreSQL exacta"):
                call_command("run_shop_scheduler_lab", "--once")

    run.assert_not_called()


def test_replay_after_interruption_does_not_duplicate_effects(domain, scheduler_lab):
    order = money(domain)
    observe(order, "paid")
    cancellation = request_cancellation(domain.customer.pk, order.pk, reason="Prueba de recuperación local")
    resolve_cancellation(domain.admin, cancellation.pk, approve=True, reason="Reintegrar en laboratorio")
    refund = order.payment_operations.get(kind="REFUND")
    create = order.payment_operations.get(kind="CREATE")
    keys = {
        "create": (create.external_key, deepcopy(create.payload)),
        "refund": (refund.external_key, deepcopy(refund.payload)),
    }
    simulate(order.remote_id, "refunded")
    enqueue_reconcile(order.pk)

    original_handle = process_shop_outbox.Command.handle
    interrupted = False

    def process_then_interrupt(command, *args, **options):
        nonlocal interrupted
        result = original_handle(command, *args, **options)
        if not interrupted:
            interrupted = True
            raise KeyboardInterrupt
        return result

    first_output = StringIO()
    with patch.object(process_shop_outbox.Command, "handle", process_then_interrupt):
        call_command("run_shop_scheduler_lab", "--once", "--limit", "100", stdout=first_output)

    second_output = StringIO()
    call_command("run_shop_scheduler_lab", "--once", "--limit", "100", stdout=second_output)

    order.refresh_from_db()
    create.refresh_from_db()
    refund.refresh_from_db()
    assert "result=interrupted" in first_output.getvalue()
    assert order.state == Order.State.REFUNDED
    assert order.stock_released
    assert Product.objects.get(pk=domain.product.pk).stock == 10
    assert (create.external_key, create.payload) == keys["create"]
    assert (refund.external_key, refund.payload) == keys["refund"]
    assert "result=ok" in second_output.getvalue()


def test_scheduler_lab_reports_backlog_without_writing_diagnostics(domain, scheduler_lab):
    order = buy(domain, mode="MONEY")[0]
    operation = order.payment_operations.get(kind="CREATE")
    PaymentOperation.objects.filter(pk=operation.pk).update(state=PaymentOperation.State.BLOCKED)
    wallet = Wallet.objects.get(tourist=domain.customer)
    expected_balance = wallet.balance + 1
    Wallet.objects.filter(pk=wallet.pk).update(balance=expected_balance)
    operation_count = PaymentOperation.objects.count()

    output = StringIO()
    workers = (process_shop_outbox, expire_shop_orders, reconcile_shop_orders)
    with ExitStack() as stack:
        for module in workers:
            stack.enter_context(patch.object(module.Command, "handle"))
        call_command("run_shop_scheduler_lab", "--once", "--limit", "10", stdout=output)

    wallet.refresh_from_db()
    operation.refresh_from_db()
    report = output.getvalue()
    assert "stage=diagnostics" in report
    assert "blocked=1" in report
    assert "ledger_diff=1" in report
    assert "result=attention" in report
    assert str(operation.external_key) not in report
    assert operation.state == PaymentOperation.State.BLOCKED
    assert wallet.balance == expected_balance
    assert PaymentOperation.objects.count() == operation_count
