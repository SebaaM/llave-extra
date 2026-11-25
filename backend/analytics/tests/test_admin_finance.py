from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from administration.models import AdminAudit
from analytics.provenance import (
    DEMO_ACTIVITY_ACTION,
    DEMO_ACTIVITY_RESOURCE,
    LEGACY_ACCESS_SEED_KEY,
)
from credits.models import AdjustmentCase, Consumption, Wallet, WalletEntry
from providers.models import DemoSeedState, Provider
from referrals.models import CollaboratorProfile
from shop.models import CheckoutKey, Order, OrderAudit, OrderLine, Product

ANALYTICS_TIMEZONE = ZoneInfo("America/Argentina/Ushuaia")
PERIOD_QUERY = {"from": "2026-11-01", "to": "2026-11-30"}
FINANCE_URL = "/api/v1/admin/analytics/finance/"


@pytest.fixture
def admin_client():
    admin = User.objects.create_superuser("finance-admin@example.test", "Secret-123")
    access, _ = issue_session(admin)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client, admin


def local_time(day, hour=0, minute=0, second=0, microsecond=0):
    return datetime.combine(day, time(hour, minute, second, microsecond), tzinfo=ANALYTICS_TIMEZONE)


def create_user(alias, role=User.Role.TOURIST, **kwargs):
    return User.objects.create_user(f"{alias}@example.test", role=role, **kwargs)


def create_provider(alias, *, demo=False):
    return Provider.objects.create(slug=alias, name=f"Prestador {alias}", demo=demo)


def create_consumption(customer, provider, created_at, *, collaborator=None, state=Consumption.State.VALID, admin=None):
    values = {
        "tourist": customer,
        "provider": provider,
        "collaborator": collaborator,
        "award": 35,
        "rule_snapshot": {},
        "state": state,
    }
    if state == Consumption.State.ANNULLED:
        values.update(
            annulled_at=created_at + timedelta(minutes=1),
            annulled_by=admin,
            annul_reason="Anulación de prueba",
        )
    with patch("django.utils.timezone.now", return_value=created_at):
        return Consumption.objects.create(**values)


def create_entry(wallet, kind, delta, reference, created_at, *, source_entry=None):
    with patch("django.utils.timezone.now", return_value=created_at):
        return WalletEntry.objects.create(
            wallet=wallet,
            kind=kind,
            delta=delta,
            reference=reference,
            source_entry=source_entry,
        )


def create_order(customer, created_at, *, mode, total_credits=None, total_money=None,
                 state=None, payment_provider="", payment_confirmed=False, product_demo=False):
    if state is None:
        state = Order.State.PAID if mode == Order.Mode.CREDITS else Order.State.PENDING_PAYMENT
    with patch("django.utils.timezone.now", return_value=created_at):
        order = Order.objects.create(
            customer=customer,
            mode=mode,
            state=state,
            total_credits=total_credits,
            total_money=total_money,
            pickup_snapshot={},
            reserved_until=(created_at + timedelta(minutes=15) if mode == Order.Mode.MONEY else None),
            payment_provider=payment_provider,
            payment_confirmed=payment_confirmed,
        )
    if mode == Order.Mode.CREDITS:
        parts = [total_credits // 2, total_credits - total_credits // 2]
    else:
        total_cents = int(total_money * 100)
        cents = [total_cents // 2, total_cents - total_cents // 2]
        parts = [Decimal(value) / 100 for value in cents]
    for index, price in enumerate(parts):
        product_values = {
            "name": f"Producto {order.pk}-{index}",
            "active": True,
            "stock": 10,
            "demo": product_demo,
        }
        line_values = {"unit_money": None, "unit_credits": None}
        if mode == Order.Mode.CREDITS:
            product_values["price_credits"] = price
            line_values["unit_credits"] = price
        else:
            product_values["price_money"] = price
            line_values["unit_money"] = price
        product = Product.objects.create(**product_values)
        OrderLine.objects.create(
            order=order,
            product=product,
            name=product.name,
            quantity=1,
            **line_values,
        )
    CheckoutKey.objects.create(
        actor=customer,
        key=f"finance-checkout-{order.pk}",
        fingerprint="a" * 64,
        order=order,
    )
    return order


def add_order_event(order, action, created_at):
    with patch("django.utils.timezone.now", return_value=created_at):
        return OrderAudit.objects.create(order=order, action=action, actor=None, reason="Evento confiable")


@pytest.mark.django_db
def test_finance_counts_only_dated_authoritative_events(admin_client):
    client, admin = admin_client
    direct_customer = create_user("finance-direct")
    referred_customer = create_user("finance-referred")
    collaborator = CollaboratorProfile.objects.create(
        user=create_user("finance-collaborator", role=User.Role.COLLABORATOR),
        enabled=True,
    )
    direct_provider = create_provider("finance-direct")
    referred_provider = create_provider("finance-referred")
    direct_visit = create_consumption(
        direct_customer, direct_provider, local_time(date(2026, 11, 2)),
    )
    referred_visit = create_consumption(
        referred_customer, referred_provider, local_time(date(2026, 11, 3)),
        collaborator=collaborator,
    )
    direct_wallet = Wallet.objects.create(tourist=direct_customer)
    referred_wallet = Wallet.objects.create(tourist=referred_customer)
    create_entry(
        direct_wallet, WalletEntry.Kind.EARN, 35,
        f"consumption:{direct_visit.pk}:earn", local_time(date(2026, 11, 2)),
    )
    create_entry(
        referred_wallet, WalletEntry.Kind.EARN, 20,
        f"consumption:{referred_visit.pk}:earn", local_time(date(2026, 11, 3)),
    )

    annulled_customer = create_user("finance-annulled")
    annulled_consumption = create_consumption(
        annulled_customer, create_provider("finance-annulled"), local_time(date(2026, 10, 31)),
        state=Consumption.State.ANNULLED, admin=admin,
    )
    annulled_wallet = Wallet.objects.create(tourist=annulled_customer)
    create_entry(
        annulled_wallet, WalletEntry.Kind.REVERSAL, -35,
        f"consumption:{annulled_consumption.pk}:reversal", local_time(date(2026, 11, 4)),
    )

    funded_customer = create_user("finance-funded")
    funded_consumption = create_consumption(
        funded_customer, create_provider("finance-funded"), local_time(date(2026, 10, 30)),
        state=Consumption.State.ANNULLED, admin=admin,
    )
    funded_wallet = Wallet.objects.create(tourist=funded_customer)
    funded_case = AdjustmentCase.objects.create(
        consumption=funded_consumption,
        shortfall=15,
        funded_amount=15,
        created_at=local_time(date(2026, 11, 4)),
        resolved_at=local_time(date(2026, 11, 5)),
        resolved_by=admin,
        resolution=AdjustmentCase.Resolution.FUNDED,
        resolution_reason="Aporte auditado",
    )
    create_entry(
        funded_wallet, WalletEntry.Kind.ADJUSTMENT, 15,
        f"adjustment:{funded_case.pk}:funding", local_time(date(2026, 11, 5)),
    )

    credit_customer = create_user("finance-credit-order")
    credit_wallet = Wallet.objects.create(tourist=credit_customer)
    credit_order = create_order(
        credit_customer, local_time(date(2026, 11, 6)),
        mode=Order.Mode.CREDITS, total_credits=120,
    )
    debit = create_entry(
        credit_wallet, WalletEntry.Kind.REDEEM, -120,
        f"shop:{credit_order.pk}:debit", local_time(date(2026, 10, 31)),
    )
    create_entry(
        credit_wallet, WalletEntry.Kind.REFUND, 50,
        f"shop:{credit_order.pk}:refund", local_time(date(2026, 11, 8)),
        source_entry=debit,
    )

    historical_credit_customer = create_user("finance-old-credit-order")
    historical_credit_wallet = Wallet.objects.create(tourist=historical_credit_customer)
    historical_credit_order = create_order(
        historical_credit_customer, local_time(date(2026, 10, 31)),
        mode=Order.Mode.CREDITS, total_credits=20,
    )
    create_entry(
        historical_credit_wallet, WalletEntry.Kind.REDEEM, -20,
        f"shop:{historical_credit_order.pk}:debit", local_time(date(2026, 11, 9)),
    )

    demo_customer = create_user("finance-demo-customer")
    demo_wallet = Wallet.objects.create(tourist=demo_customer)
    AdminAudit.objects.create(
        actor=admin, action=DEMO_ACTIVITY_ACTION, resource=DEMO_ACTIVITY_RESOURCE,
        object_id=str(demo_customer.pk), reason="Cliente de actividad sintética",
    )
    DemoSeedState.objects.create(key=LEGACY_ACCESS_SEED_KEY)
    legacy_wallet = Wallet.objects.create(tourist=create_user("finance-legacy-seed"))
    create_entry(
        legacy_wallet, WalletEntry.Kind.REDEEM, -34, "demo-e4-order",
        local_time(date(2026, 11, 7)),
    )
    demo_order = create_order(
        demo_customer, local_time(date(2026, 11, 7)),
        mode=Order.Mode.CREDITS, total_credits=34, product_demo=True,
    )
    create_entry(
        demo_wallet, WalletEntry.Kind.REDEEM, -34, f"shop:{demo_order.pk}:debit",
        local_time(date(2026, 11, 7)),
    )

    paid_customer = create_user("finance-paid")
    paid_order = create_order(
        paid_customer, local_time(date(2026, 11, 5)),
        mode=Order.Mode.MONEY, total_money=Decimal("100.50"),
        state=Order.State.PAID, payment_provider="mercadopago", payment_confirmed=True,
    )
    add_order_event(paid_order, "PAID", local_time(date(2026, 11, 5)))
    add_order_event(paid_order, "PAID", local_time(date(2026, 11, 6)))

    refund_customer = create_user("finance-refunded")
    refund_order = create_order(
        refund_customer, local_time(date(2026, 11, 9)),
        mode=Order.Mode.MONEY, total_money=Decimal("250.25"),
        state=Order.State.REFUNDED, payment_provider="mercadopago", payment_confirmed=True,
    )
    add_order_event(refund_order, "PAID", local_time(date(2026, 11, 9)))
    add_order_event(refund_order, "REFUNDED", local_time(date(2026, 11, 20)))

    duplicate_customer = create_user("finance-old-payment")
    duplicate_order = create_order(
        duplicate_customer, local_time(date(2026, 10, 30)),
        mode=Order.Mode.MONEY, total_money=Decimal("90.00"),
        state=Order.State.PAID, payment_provider="mercadopago", payment_confirmed=True,
    )
    add_order_event(duplicate_order, "PAID", local_time(date(2026, 10, 31)))
    add_order_event(duplicate_order, "PAID", local_time(date(2026, 11, 3)))

    undated_customer = create_user("finance-undated")
    create_order(
        undated_customer, local_time(date(2024, 1, 1)),
        mode=Order.Mode.MONEY, total_money=Decimal("80.00"),
        state=Order.State.PAYMENT_REVIEW, payment_provider="mercadopago", payment_confirmed=True,
    )

    pending_customer = create_user("finance-pending")
    create_order(
        pending_customer, local_time(date(2026, 11, 11)),
        mode=Order.Mode.MONEY, total_money=Decimal("41.00"),
        state=Order.State.PENDING_PAYMENT, payment_provider="mercadopago",
    )

    fake_customer = create_user("finance-fake")
    fake_order = create_order(
        fake_customer, local_time(date(2026, 11, 12)),
        mode=Order.Mode.MONEY, total_money=Decimal("19.00"),
        state=Order.State.PAID, payment_provider="fake", payment_confirmed=True,
    )
    add_order_event(fake_order, "PAID", local_time(date(2026, 11, 12)))

    incident_customer = create_user("finance-delivery-incident")
    incident_order = create_order(
        incident_customer, local_time(date(2026, 11, 13)),
        mode=Order.Mode.MONEY, total_money=Decimal("70.00"),
        state=Order.State.PICKED_UP, payment_provider="mercadopago", payment_confirmed=True,
    )
    add_order_event(incident_order, "PAID", local_time(date(2026, 11, 13)))
    add_order_event(incident_order, "PAYMENT_REVIEW", local_time(date(2026, 11, 20)))

    response = client.get(FINANCE_URL, PERIOD_QUERY)

    assert response.status_code == 200
    assert response.data == {
        "period": {
            "from": "2026-11-01",
            "to": "2026-11-30",
            "timezone": "America/Argentina/Ushuaia",
        },
        "valid_visits": {
            "direct": {"status": "available", "value": 1},
            "referred": {"status": "available", "value": 1},
        },
        "credits": {
            "earn": {"status": "available", "value": 55},
            "reversal": {"status": "available", "value": -35},
            "redeem": {"status": "available", "value": -20},
            "refund": {"status": "available", "value": 50},
            "adjustment": {"status": "available", "value": 15},
        },
        "shop": {
            "credit_redemptions": {"status": "available", "value": 1},
            "confirmed_ars": {"status": "available", "value": "420.75"},
            "refunded_ars": {"status": "available", "value": "250.25"},
            "undated_confirmations_count": {"status": "available", "value": 1},
        },
    }
    assert "example.test" not in str(response.data)
    assert not {"tourist_id", "client_id", "customer_id", "email"}.intersection(response.data)


@pytest.mark.django_db
def test_unverified_credit_origin_makes_only_its_metric_unavailable(admin_client):
    client, _ = admin_client
    customer = create_user("finance-unknown-origin")
    wallet = Wallet.objects.create(tourist=customer)
    create_entry(
        wallet, WalletEntry.Kind.EARN, 12, "legacy:origin-not-recorded",
        local_time(date(2026, 11, 10)),
    )

    response = client.get(FINANCE_URL, PERIOD_QUERY)

    assert response.status_code == 200
    assert response.data["credits"]["earn"] == {"status": "unavailable", "value": None}
    assert response.data["credits"]["reversal"] == {"status": "available", "value": 0}
    assert response.data["shop"]["confirmed_ars"] == {"status": "available", "value": "0.00"}


@pytest.mark.django_db
@pytest.mark.parametrize("role,active,staff,superuser", [
    (User.Role.TOURIST, True, True, False),
    (User.Role.COLLABORATOR, True, True, False),
    (User.Role.PROVIDER, True, True, False),
    (User.Role.ADMIN, False, True, True),
    (User.Role.ADMIN, True, False, True),
    (User.Role.ADMIN, True, True, False),
])
def test_finance_requires_exact_active_program_admin(admin_client, role, active, staff, superuser):
    client, _ = admin_client
    actor = create_user(
        f"finance-denied-{role.lower()}-{active}-{staff}-{superuser}",
        role=role,
        is_active=active,
        is_staff=staff,
        is_superuser=superuser,
    )
    denied = APIClient()
    denied.force_authenticate(actor)

    assert denied.get(FINANCE_URL, PERIOD_QUERY).status_code == 403
    assert APIClient().get(FINANCE_URL, PERIOD_QUERY).status_code == 401
    assert client.get(FINANCE_URL, PERIOD_QUERY).status_code == 200
