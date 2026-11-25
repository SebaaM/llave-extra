from django.db.models import (
    BigIntegerField,
    CharField,
    Count,
    DecimalField,
    Exists,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Cast, Concat

from administration.models import AdminAudit
from analytics.periods import AnalyticsPeriod
from credits.models import AdjustmentCase, Consumption, WalletEntry
from providers.models import Benefit
from shop.models import Order, OrderAudit, OrderLine

DEMO_ACTIVITY_ACTION = "DEMO_ACTIVITY"
DEMO_ACTIVITY_RESOURCE = "users"
LEGACY_E4_ORDER_REFERENCE = "demo-e4-order"
REAL_PAYMENT_PROVIDER = "mercadopago"
FAKE_PAYMENT_PROVIDER = "fake"


def _activity_demo_users(user_field):
    return AdminAudit.objects.filter(
        action=DEMO_ACTIVITY_ACTION,
        resource=DEMO_ACTIVITY_RESOURCE,
        object_id=Cast(OuterRef(user_field), output_field=CharField()),
    )


def _consumption_source(kind, *, real_only):
    suffix = "earn" if kind == WalletEntry.Kind.EARN else "reversal"
    source = Consumption.objects.annotate(
        _entry_reference=Concat(
            Value("consumption:"),
            Cast("pk", output_field=CharField()),
            Value(f":{suffix}"),
            output_field=CharField(),
        ),
    ).filter(
        _entry_reference=OuterRef("reference"),
        tourist_id=OuterRef("wallet__tourist_id"),
    )
    if kind == WalletEntry.Kind.REVERSAL:
        source = source.filter(state=Consumption.State.ANNULLED)
    if real_only:
        demo_benefit = Benefit.objects.filter(
            pk=OuterRef("benefit_id"),
            provider_id=OuterRef("provider_id"),
            demo=True,
        )
        source = source.annotate(
            _demo_benefit=Exists(demo_benefit),
            _demo_activity=Exists(_activity_demo_users("tourist_id")),
        ).filter(
            provider__demo=False,
            benefit_demo=False,
            _demo_benefit=False,
            _demo_activity=False,
        )
    return source


def _adjustment_source(*, real_only):
    source = AdjustmentCase.objects.annotate(
        _entry_reference=Concat(
            Value("adjustment:"),
            Cast("pk", output_field=CharField()),
            Value(":funding"),
            output_field=CharField(),
        ),
    ).filter(
        _entry_reference=OuterRef("reference"),
        consumption__tourist_id=OuterRef("wallet__tourist_id"),
        resolution=AdjustmentCase.Resolution.FUNDED,
        funded_amount=OuterRef("delta"),
    )
    if real_only:
        demo_benefit = Benefit.objects.filter(
            pk=OuterRef("consumption__benefit_id"),
            provider_id=OuterRef("consumption__provider_id"),
            demo=True,
        )
        source = source.annotate(
            _demo_benefit=Exists(demo_benefit),
            _demo_activity=Exists(_activity_demo_users("consumption__tourist_id")),
        ).filter(
            consumption__provider__demo=False,
            consumption__benefit_demo=False,
            _demo_benefit=False,
            _demo_activity=False,
        )
    return source


def _orders_with_demo_provenance():
    demo_product = OrderLine.objects.filter(
        order_id=OuterRef("pk"),
        product__demo=True,
    )
    return Order.objects.annotate(
        _demo_activity=Exists(_activity_demo_users("customer_id")),
        _demo_product=Exists(demo_product),
    )


def _credit_order_source(*, real_only):
    source = _orders_with_demo_provenance().annotate(
        _entry_reference=Concat(
            Value("shop:"),
            Cast("pk", output_field=CharField()),
            Value(":debit"),
            output_field=CharField(),
        ),
    ).filter(
        _entry_reference=OuterRef("reference"),
        mode=Order.Mode.CREDITS,
        customer_id=OuterRef("wallet__tourist_id"),
        total_credits=-OuterRef("delta"),
    )
    if real_only:
        source = source.filter(_demo_activity=False, _demo_product=False)
    return source


def _credit_refund_order_source(*, real_only):
    source = _orders_with_demo_provenance().annotate(
        _debit_reference=Concat(
            Value("shop:"),
            Cast("pk", output_field=CharField()),
            Value(":debit"),
            output_field=CharField(),
        ),
        _refund_reference=Concat(
            Value("shop:"),
            Cast("pk", output_field=CharField()),
            Value(":refund"),
            output_field=CharField(),
        ),
    ).filter(
        _debit_reference=OuterRef("source_entry__reference"),
        _refund_reference=OuterRef("reference"),
        mode=Order.Mode.CREDITS,
        customer_id=OuterRef("wallet__tourist_id"),
        total_credits=-OuterRef("source_entry__delta"),
        total_credits__gte=OuterRef("delta"),
    )
    if real_only:
        source = source.filter(_demo_activity=False, _demo_product=False)
    return source


def _credit_order_debit():
    debit_reference = Concat(
        Value("shop:"),
        Cast(OuterRef("pk"), output_field=CharField()),
        Value(":debit"),
        output_field=CharField(),
    )
    return WalletEntry.objects.filter(
        kind=WalletEntry.Kind.REDEEM,
        reference=debit_reference,
        wallet__tourist_id=OuterRef("customer_id"),
        delta=-OuterRef("total_credits"),
    )


def _credit_entry_sources(kind):
    if kind in (WalletEntry.Kind.EARN, WalletEntry.Kind.REVERSAL):
        return _consumption_source(kind, real_only=False), _consumption_source(kind, real_only=True)
    if kind == WalletEntry.Kind.ADJUSTMENT:
        return _adjustment_source(real_only=False), _adjustment_source(real_only=True)
    if kind == WalletEntry.Kind.REDEEM:
        return _credit_order_source(real_only=False), _credit_order_source(real_only=True)
    if kind == WalletEntry.Kind.REFUND:
        return _credit_refund_order_source(real_only=False), _credit_refund_order_source(real_only=True)
    raise ValueError(f"Unsupported wallet entry kind: {kind}")


def _metric(value):
    return {"status": "available", "value": value}


def _unavailable():
    return {"status": "unavailable", "value": None}


def _credit_metric(kind, period):
    source_exists, source_is_real = _credit_entry_sources(kind)
    entries = WalletEntry.objects.filter(kind=kind, **period.datetime_filters()).annotate(
        _source_exists=Exists(source_exists),
        _source_is_real=Exists(source_is_real),
        _demo_activity=Exists(_activity_demo_users("wallet__tourist_id")),
    )
    unknown_filter = Q(
        _source_is_real=False,
        _source_exists=False,
        _demo_activity=False,
    )
    if kind == WalletEntry.Kind.REDEEM:
        unknown_filter &= ~Q(reference=LEGACY_E4_ORDER_REFERENCE)
    totals = entries.aggregate(
        unknown_count=Count("pk", filter=unknown_filter),
        total=Sum(
            "delta",
            filter=Q(_source_is_real=True, _demo_activity=False),
            output_field=BigIntegerField(),
        ),
    )
    if totals["unknown_count"]:
        return _unavailable()
    return _metric(int(totals["total"] or 0))

def _valid_visits(period):
    demo_benefit = Benefit.objects.filter(
        pk=OuterRef("benefit_id"),
        provider_id=OuterRef("provider_id"),
        demo=True,
    )
    visits = Consumption.objects.filter(
        state=Consumption.State.VALID,
        **period.datetime_filters(),
    ).annotate(
        _demo_benefit=Exists(demo_benefit),
        _demo_activity=Exists(_activity_demo_users("tourist_id")),
    ).filter(
        provider__demo=False,
        benefit_demo=False,
        _demo_benefit=False,
        _demo_activity=False,
    )
    totals = visits.aggregate(
        direct=Count("pk", filter=Q(collaborator__isnull=True)),
        referred=Count("pk", filter=Q(collaborator__isnull=False)),
    )
    return {
        "direct": _metric(int(totals["direct"] or 0)),
        "referred": _metric(int(totals["referred"] or 0)),
    }


def _money_orders():
    return _orders_with_demo_provenance().filter(
        mode=Order.Mode.MONEY,
        _demo_activity=False,
        _demo_product=False,
    )


def _first_authoritative_event(action):
    return OrderAudit.objects.filter(
        order_id=OuterRef("pk"),
        action=action,
        actor__isnull=True,
    ).order_by("created_at", "pk").values("created_at")[:1]


def _first_event_orders(action):
    return _money_orders().annotate(
        _first_event_at=Subquery(_first_authoritative_event(action)),
    )


def _unknown_provider_event_exists(action, period):
    events = _first_event_orders(action).exclude(
        payment_provider__in=("mercadopago", "fake"),
    )
    return events.filter(**period.datetime_filters("_first_event_at")).exists()


def _money_total_metric(action, period):
    events = _first_event_orders(action)
    in_period = Q(**period.datetime_filters("_first_event_at"))
    unknown_provider = ~Q(payment_provider__in=("mercadopago", "fake")) & in_period
    unconfirmed_event = Q(
        payment_provider="mercadopago",
        payment_confirmed=False,
    ) & in_period
    verified_event = Q(
        payment_provider="mercadopago",
        payment_confirmed=True,
    ) & in_period
    totals = events.aggregate(
        total=Sum(
            "total_money",
            filter=verified_event,
            output_field=DecimalField(max_digits=20, decimal_places=2),
        ),
        unknown_count=Count("pk", filter=unknown_provider),
        unconfirmed_count=Count("pk", filter=unconfirmed_event),
    )
    if totals["unknown_count"] or totals["unconfirmed_count"]:
        return _unavailable()
    return _metric(format(totals["total"] or 0, ".2f"))


def _undated_confirmations_metric():
    events = _first_event_orders("PAID")
    undated = Q(payment_confirmed=True, _first_event_at__isnull=True)
    totals = events.aggregate(
        unknown_count=Count(
            "pk",
            filter=undated & ~Q(payment_provider__in=("mercadopago", "fake")),
        ),
        count=Count(
            "pk",
            filter=undated & Q(payment_provider="mercadopago"),
        ),
    )
    if totals["unknown_count"]:
        return _unavailable()
    return _metric(totals["count"] or 0)

def _credit_redemptions(period):
    orders = _orders_with_demo_provenance().filter(
        mode=Order.Mode.CREDITS,
        **period.datetime_filters(),
        _demo_activity=False,
        _demo_product=False,
    ).annotate(_has_debit=Exists(_credit_order_debit()))
    totals = orders.aggregate(
        unknown_count=Count("pk", filter=Q(_has_debit=False)),
        redemptions=Count("pk", filter=Q(_has_debit=True)),
    )
    if totals["unknown_count"]:
        return _unavailable()
    return _metric(totals["redemptions"] or 0)

def finance_report(period: AnalyticsPeriod):
    credits = {
        kind.lower(): _credit_metric(kind, period)
        for kind in WalletEntry.Kind.values
    }
    return {
        "period": period.as_dict(),
        "valid_visits": _valid_visits(period),
        "credits": credits,
        "shop": {
            "credit_redemptions": _credit_redemptions(period),
            "confirmed_ars": _money_total_metric("PAID", period),
            "refunded_ars": _money_total_metric("REFUNDED", period),
            "undated_confirmations_count": _undated_confirmations_metric(),
        },
    }
