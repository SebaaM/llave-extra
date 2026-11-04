from django.core.management.base import CommandError
from django.db import transaction

from accounts.models import User
from administration.models import AdminAudit
from credits.models import AdjustmentCase, Consumption, ProviderConsumptionCredential, Wallet
from credits.services import (
    annul_consumption,
    award_consumption,
    resolve_adjustment,
    sign_provider_qr,
)
from providers.models import Benefit, DemoSeedState, FolderBenefit, Provider
from referrals.access import redeem_qr, sign_qr
from referrals.models import CollaboratorProfile
from shop.models import CancellationRequest, Order
from shop.payments.fake import FakeGateway, simulate
from shop.payments.processing import claim, enqueue_reconcile, execute
from shop.services import advance_order, checkout, request_cancellation, resolve_cancellation

from .catalog import PREFIX, create_user, email, identity

REASON = "DEMO — actividad ficticia para pruebas de backoffice"
PAYMENT_STATES = ("PENDING_PAYMENT", "PAID", "READY", "PICKED_UP", "CANCELED", "REFUND_PENDING", "REFUNDED", "PAYMENT_REVIEW")


def admin_user():
    return User.objects.get(email=email("admin"))


def seed_customer(credentials, index):
    key = f"{PREFIX}:customer:{index}"
    if DemoSeedState.objects.filter(pk=key).exists():
        return
    with transaction.atomic():
        kind = index % 20
        customer = create_user(credentials, "cliente", index, User.Role.TOURIST,
            email_verified=kind != 1, is_active=kind != 2)
        if kind not in (0, 1, 2):
            profile_ids = [identity("profile", index % 8)]
            if index % 5 == 0:
                profile_ids.append(identity("profile", (index + 1) % 8))
            # Hold all profiles in the administrative bulk-lock order before any
            # provider/benefit locks acquired by the consumption services.
            list(CollaboratorProfile.objects.select_for_update(of=("self",))
                 .filter(pk__in=profile_ids).order_by("pk"))
            profile = CollaboratorProfile.objects.get(pk=identity("profile", index % 8))
            redeem_qr(customer, sign_qr(profile))
            if index % 5 == 0:
                second = CollaboratorProfile.objects.get(pk=identity("profile", (index + 1) % 8))
                redeem_qr(customer, sign_qr(second))
            selections = list(FolderBenefit.objects.filter(collaborator=profile).select_related("benefit__provider").order_by("benefit_id"))
            visits = 1 if index % 15 in (4, 5, 6) else 2 + index % 6
            if len(selections) < visits:
                raise CommandError("La selección demo cambió: faltan beneficios para los nuevos escenarios")
            # An award also retains the global credit policy until this customer's
            # outer transaction ends. Acquire the entire provider/benefit batch
            # first, so a later award cannot invert Provider -> CreditPolicy.
            chosen = selections[:visits]
            list(Provider.objects.select_for_update().filter(pk__in=[s.benefit.provider_id for s in chosen]).order_by("pk"))
            list(Benefit.objects.select_for_update().filter(pk__in=[s.benefit_id for s in chosen]).order_by("pk"))
            consumption_ids = []
            for position, selection in enumerate(chosen):
                provider = selection.benefit.provider
                credential = ProviderConsumptionCredential.objects.get(provider=provider)
                response, _ = award_consumption(customer, profile.pk if position % 3 else None,
                    sign_provider_qr(credential), credentials.data["pins"][str(provider.pk)],
                    f"activity-v1-consume-{position}")
                consumption_ids.append(response["id"])
            admin = admin_user()
            if index % 15 in (4, 5, 6):
                balance = Wallet.objects.get(tourist=customer).balance
                order, _ = checkout(customer.pk, mode="CREDITS", items=[{
                    "product_id": str(identity("product", index % 8)), "quantity": balance // 100,
                }], idempotency_key="activity-v1-adjustment-redemption")
                advance_order(admin, order.pk, target="READY", reason=REASON)
                advance_order(admin, order.pk, target="PICKED_UP", reason=REASON)
                case = annul_consumption(consumption_ids[0], admin, REASON)
                if index % 15 != 4:
                    resolution = AdjustmentCase.Resolution.FUNDED if index % 15 == 5 else AdjustmentCase.Resolution.FORGIVEN
                    resolve_adjustment(case.pk, admin, resolution, REASON)
            else:
                if index % 3 == 0:
                    order, _ = checkout(customer.pk, mode="CREDITS", items=[{
                        "product_id": str(identity("product", index % 8)), "quantity": 1 + index % 3,
                    }], idempotency_key="activity-v1-redemption")
                    scenario = (index // 3) % 6
                    if scenario in (1, 2):
                        advance_order(admin, order.pk, target="READY", reason=REASON)
                    if scenario == 2:
                        advance_order(admin, order.pk, target="PICKED_UP", reason=REASON)
                    if scenario in (3, 4, 5):
                        cancellation = request_cancellation(customer.pk, order.pk, reason=REASON)
                        if scenario != 3:
                            resolve_cancellation(admin, cancellation.pk, approve=scenario == 4, reason=REASON)
                if index % 15 == 3:
                    annul_consumption(consumption_ids[0], admin, REASON)
            AdminAudit.objects.create(actor=admin, action="DEMO_ACTIVITY", resource="users", object_id=str(customer.pk),
                changed_fields=["consumptions", "credits"], reason=REASON)
        DemoSeedState.objects.create(pk=key)


def process_order(order, kind):
    """Only this order, with an explicit local gateway; never drain a shared outbox."""
    operation = order.payment_operations.get(kind=kind)
    if operation.state == "DONE":
        return
    leased = claim(operation.pk)
    if not leased or not execute(leased, gateway=FakeGateway()):
        raise CommandError("Operación demo en curso: reintentá cuando venza su lease, sin cambiar claves")
    operation.refresh_from_db()
    if operation.state != "DONE":
        raise CommandError("Operación demo bloqueada; revisar la ficha sin cambiar su clave")


def observe(order, state):
    simulate(order.remote_id, state)
    enqueue_reconcile(order.pk)
    process_order(order, "RECONCILE")
    order.refresh_from_db()


def seed_payment(index):
    key = f"{PREFIX}:payment:{index}"
    if DemoSeedState.objects.filter(pk=key).exists():
        return
    customer = User.objects.get(email=email("cliente", index))
    # Ineligible accounts are deliberately present without financial transactions.
    if not customer.is_active or not customer.email_verified or index % 20 == 0 or index % 3 != 1:
        DemoSeedState.objects.get_or_create(pk=key)
        return
    admin = admin_user()
    target = PAYMENT_STATES[(index // 3) % len(PAYMENT_STATES)]
    order, _ = checkout(customer.pk, mode="MONEY", items=[{
        "product_id": str(identity("product", index % 8)), "quantity": 1 + index % 2,
    }], idempotency_key="activity-v1-money")
    if order.state != target:
        if not order.remote_id:
            process_order(order, "CREATE")
            order.refresh_from_db()
        if target not in ("PENDING_PAYMENT", "CANCELED"):
            if order.state == "PENDING_PAYMENT":
                observe(order, "paid")
            if target in ("READY", "PICKED_UP") and order.state == "PAID":
                advance_order(admin, order.pk, target="READY", reason=REASON)
                order.refresh_from_db()
            if target == "PICKED_UP" and order.state == "READY":
                advance_order(admin, order.pk, target="PICKED_UP", reason=REASON)
            if target == "PAYMENT_REVIEW" and order.state == "PAID":
                observe(order, "unknown")
        if target in ("CANCELED", "REFUND_PENDING", "REFUNDED"):
            order.refresh_from_db()
            if order.state in ("PENDING_PAYMENT", "PAID"):
                cancellation = order.cancellations.filter(state=CancellationRequest.State.OPEN).first()
                cancellation = cancellation or request_cancellation(customer.pk, order.pk, reason=REASON)
                resolve_cancellation(admin, cancellation.pk, approve=True, reason=REASON)
                order.refresh_from_db()
            if target == "REFUNDED" and order.state == "REFUND_PENDING":
                process_order(order, "REFUND")
                observe(order, "refunded")
        order.refresh_from_db()
    # Never silently mark a partly executed or operator-edited scenario complete.
    if order.state != target:
        raise CommandError(f"El pedido demo no llegó a {target}; revisar sin editar su historia")
    DemoSeedState.objects.get_or_create(pk=key)


def summary():
    from django.db.models import Count

    return {
        "clients": User.objects.filter(email__startswith="activity.cliente.").count(),
        "consumptions": Consumption.objects.filter(tourist__email__startswith="activity.cliente.").count(),
        "orders": list(Order.objects.filter(customer__email__startswith="activity.cliente.")
                       .values("state").annotate(count=Count("pk")).order_by("state")),
        "open_adjustments": AdjustmentCase.objects.filter(consumption__tourist__email__startswith="activity.cliente.",
                                                          resolved_at__isnull=True).count(),
    }
