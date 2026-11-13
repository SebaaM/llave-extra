import json
import uuid
from decimal import ROUND_HALF_UP, Decimal
from hmac import compare_digest

from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.debug import sensitive_variables
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from accounts.models import User
from credits.models import Consumption
from providers.access import locked_owned_provider
from providers.models import Provider

from .models import (
    BenefitCommissionRule,
    Commission,
    CommissionCommand,
    CommissionEvent,
    CommissionRule,
    PaymentReference,
    RuleSource,
)
from .models import (
    CommissionState as State,
)
from .models import (
    EventKind as Event,
)

CENT = Decimal("0.01")
DEFAULT_RATE = Decimal("5.00")
# One transaction-scoped lock protects creation, deletion and reading for approval
# even when the applicable rule (or both rules) does not exist.
RULE_LOCK = (1200471901, 1)


def conflict(message):
    from credits.services import Conflict

    raise Conflict(message)


def digest(namespace, value):
    data = json.dumps(value, cls=DjangoJSONEncoder, sort_keys=True, separators=(",", ":"))
    return salted_hmac("commissions." + namespace, data, algorithm="sha256").hexdigest()


def _actor(user, *, admin):
    role = User.Role.ADMIN if admin else User.Role.PROVIDER
    actor = User.objects.select_for_update(no_key=True).filter(pk=user.pk, is_active=True, role=role).first()
    if actor is None or (admin and not (actor.is_staff and actor.is_superuser)):
        raise PermissionDenied("La sesión no tiene permisos para esta operación.")
    return actor


def _rule_lock():
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s, %s)", RULE_LOCK)


def applicable_rule(provider_id):
    return CommissionRule.objects.filter(provider_id=provider_id).first() or CommissionRule.objects.filter(
        provider__isnull=True,
    ).first()


def global_rate():
    rate = CommissionRule.objects.filter(provider__isnull=True).values_list("rate", flat=True).first()
    return DEFAULT_RATE if rate is None else rate


def case_rate(commission, rule):
    if commission and commission.verified_rate is not None:
        return commission.verified_rate
    return rule.rate if rule else None


def _name(actor):
    return actor.get_full_name().strip() or actor.get_role_display()


def _event(commission, actor, kind, *, created_at=None, **fields):
    return CommissionEvent.objects.create(
        commission=commission, actor=actor, actor_name=_name(actor), kind=kind,
        created_at=created_at or timezone.now(), **fields,
    )


def _save(commission, event):
    commission.last_event = event
    commission.save(update_fields=["state", "incident", "declaration", "approval", "payment", "last_event"])


def record_referral(consumption, *, benefit=None):
    if not consumption.collaborator_id or not consumption.benefit_id or consumption.benefit_demo:
        return
    if not connection.in_atomic_block:
        raise RuntimeError("La ficha debe crearse en la misma transacción que el consumo.")
    snapshot = {}
    if benefit is not None:
        if benefit.pk != consumption.benefit_id or benefit.provider_id != consumption.provider_id:
            raise ValueError("El beneficio no corresponde al consumo.")
        selected = BenefitCommissionRule.objects.filter(benefit=benefit).values_list("rate", flat=True).first()
        if selected is None:
            _rule_lock()
            snapshot = {"verified_rate": global_rate(), "verified_source": RuleSource.GLOBAL}
        else:
            snapshot = {"verified_rate": Decimal(selected), "verified_source": RuleSource.BENEFIT}
    commission = Commission.objects.create(consumption=consumption, **snapshot)
    verified = _event(commission, consumption.tourist, Event.VERIFIED, created_at=consumption.created_at)
    _save(commission, verified)


def record_annulment(consumption, actor, reason):
    if not connection.in_atomic_block:
        raise RuntimeError("La ficha debe anularse en la misma transacción que el consumo.")
    commission = Commission.objects.select_for_update().filter(pk=consumption.pk).first()
    if commission is None:
        return
    commission.state = State.ANNULLED
    annulled = _event(commission, actor, Event.ANNULLED, reason=reason)
    if commission.payment_id and not commission.incident:
        commission.incident = True
        annulled = _event(commission, actor, Event.INCIDENT_OPENED, basis=commission.payment,
                          reason="Se anuló un consumo con pago informado.")
    _save(commission, annulled)


def version(consumption, commission, rule):
    rule_signature = None
    if (commission and commission.verified_rate is None and rule and not commission.approval_id
            and commission.state in (State.AWAITING_PROVIDER, State.NO_COMMISSION, State.TO_PAY)):
        rule_signature = (rule.version, rule.rate)
    return digest("version", [
        consumption.pk, consumption.state, commission.last_event_id if commission else None, rule_signature,
    ])


def _command_replay(actor, key, fingerprint):
    if not isinstance(key, str) or not key.strip() or len(key) > 128 or "\x00" in key:
        raise ValidationError({"Idempotency-Key": "Ingresá una clave de hasta 128 caracteres."})
    command = CommissionCommand.objects.filter(actor=actor, key=key).first()
    if command:
        if not compare_digest(command.fingerprint, fingerprint):
            conflict("La clave ya se utilizó con otros datos.")
        return command.response
    return None


def _save_command(actor, key, fingerprint, response):
    CommissionCommand.objects.create(actor=actor, key=key, fingerprint=fingerprint, response=response)
    return response


def late_approvals(commission):
    if commission is None or commission.state != State.ANNULLED:
        return []
    if hasattr(commission, "visible_events"):
        events = [event for event in commission.visible_events if event.id <= commission.last_event_id]
    else:
        events = list(commission.events.filter(kind__in=(
            Event.APPROVED, Event.PAYMENT_REPORTED, Event.LATE_PAYMENT_REPORTED, Event.REPORT_REJECTED,
        )).order_by("id"))
    rejected_reports = {event.basis_id for event in events if event.kind == Event.REPORT_REJECTED}
    reported_approvals = {
        event.basis_id for event in events
        if event.kind in (Event.PAYMENT_REPORTED, Event.LATE_PAYMENT_REPORTED) and event.id not in rejected_reports
    }
    return [
        event for event in events
        if event.kind == Event.APPROVED and event.amount > 0 and event.id not in reported_approvals
    ]


def effective_approval(commission):
    if commission.payment and commission.payment.kind == Event.LATE_PAYMENT_REPORTED:
        return commission.payment.basis
    return commission.approval


def actions_for(commission, *, admin):
    if commission is None:
        return []
    state = commission.state
    approval = effective_approval(commission)
    payment = commission.payment
    approved_positive = approval is not None and approval.amount > 0
    if not admin:
        if state == State.AWAITING_PROVIDER and not commission.incident:
            return ["declare"]
        if (state == State.ANNULLED and late_approvals(commission)) or (
            state == State.TO_PAY and approved_positive and not payment and not commission.incident
        ):
            return ["report-payment"]
        return []
    actions = []
    if commission.incident:
        actions.append("close-incident")
    elif state == State.NO_COMMISSION:
        actions.extend(["complete-no-commission", "reopen" if approval else "request-correction"])
    elif state == State.TO_PAY:
        if payment:
            actions.extend(["reconcile", "reject-report", "open-incident"])
        elif approval:
            actions.extend(["reopen", "open-incident"])
        else:
            actions.extend(["approve", "request-correction", "complete-no-commission"])
    elif state == State.COMPLETED and payment:
        actions.append("open-incident")
    if approved_positive and (state == State.TO_PAY or commission.incident):
        actions.append("bank-details")
    return actions


def next_step(state, commission, rule):
    if commission and commission.incident:
        return "Resolver incidencia"
    if state == State.COMPLETED and not commission.payment_id:
        return "Cerrado sin comisión"
    if state == State.TO_PAY:
        if commission.payment_id:
            return "Verificar pago informado"
        if commission.approval_id:
            return "Esperar la transferencia del Prestador"
        return "Aprobar comisión" if case_rate(commission, rule) is not None else "Configurar porcentaje"
    return {
        State.AWAITING_PROVIDER: "Esperar la declaración del Prestador",
        State.NO_COMMISSION: "Revisar el cierre sin comisión",
        State.COMPLETED: "Sin pasos pendientes",
        State.ANNULLED: "Consumo anulado",
        State.HISTORICAL: "Beneficio no registrado",
        State.DEMO: "Fuera de liquidación",
    }[state]


def _declare(commission, actor, data, rule):
    commission.declaration = _event(
        commission, actor, Event.DECLARED, outcome=data["outcome"], amount=data["amount"],
    )
    commission.state = State.TO_PAY if data["amount"] else State.NO_COMMISSION
    return commission.declaration


def _approve(commission, actor, data, rule):
    from accounts.bank import locked_bank_version

    rate = case_rate(commission, rule)
    if rate is None:
        conflict("Configurá un porcentaje de comisión antes de aprobar.")
    base = data["amount"]
    if base != commission.declaration.amount and not data["reason"]:
        raise ValidationError({"reason": "Indicá el motivo del cambio de importe."})
    amount = (base * rate / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    bank_version = None
    if amount > 0:
        bank_version = locked_bank_version(commission.consumption.collaborator.user_id)
        if bank_version is None:
            conflict("El Colaborador debe configurar sus datos bancarios antes de aprobar.")
    source = commission.verified_source or (RuleSource.PROVIDER if rule and rule.provider_id else RuleSource.GLOBAL)
    commission.approval = _event(
        commission, actor, Event.APPROVED, basis=commission.declaration, base_amount=base,
        amount=amount, rate=rate, rule_source=source,
        bank_version=bank_version, reason=data["reason"],
    )
    if not amount:
        commission.state = State.NO_COMMISSION
    return commission.approval


def _report(commission, actor, data, rule):
    late = commission.state == State.ANNULLED
    approval_id = data.get("approval_id")
    approval = commission.approval
    if late:
        candidates = late_approvals(commission)
        if len(candidates) == 1 and approval_id is None:
            approval = candidates[0]
        else:
            approval = next((event for event in candidates if str(event.pk) == approval_id), None)
        if approval is None:
            raise ValidationError({"approval_id": "Elegí la aprobación a la que corresponde la transferencia."})
    elif approval_id is not None:
        raise ValidationError({"approval_id": "La transferencia debe corresponder a la aprobación vigente."})
    reference = data["reference"]
    claim, _ = PaymentReference.objects.get_or_create(
        provider_id=commission.consumption.provider_id, reference=reference, defaults={"commission": commission},
    )
    if claim.commission_id != commission.pk:
        conflict("Esa referencia de pago ya se usó en otra comisión del Prestador.")
    if commission.events.filter(
        kind__in=(Event.PAYMENT_REPORTED, Event.LATE_PAYMENT_REPORTED), reference=reference,
    ).exclude(basis=approval).exists():
        conflict("Esa referencia de pago ya se informó para otra aprobación.")
    payment = _event(
        commission, actor, Event.LATE_PAYMENT_REPORTED if late else Event.PAYMENT_REPORTED,
        basis=approval, date=data["date"], reference=reference, amount=data["amount"],
    )
    if not commission.payment_id:
        commission.payment = payment
    if late and not commission.incident:
        commission.incident = True
        return _event(commission, actor, Event.INCIDENT_OPENED, basis=payment, reason="Se informó un pago tras la anulación.")
    return payment


def _reconcile(commission, actor, data, rule):
    if commission.payment.amount != commission.approval.amount:
        conflict("El pago informado no coincide con la comisión aprobada.")
    if not data["receipt_checked"] or not data["receipt_confirmed"]:
        raise ValidationError("Confirmá el cotejo del comprobante y la recepción del pago.")
    commission.state = State.COMPLETED
    return _event(
        commission, actor, Event.PAYMENT_RECONCILED, basis=commission.payment,
        receipt_checked=True, receipt_confirmed=True,
    )


def _review(commission, actor, data, action):
    if action == "request-correction":
        event = Event.CORRECTION_REQUESTED
        commission.state = State.AWAITING_PROVIDER
        basis = commission.declaration
        commission.declaration = None
    elif action == "reopen":
        event = Event.REOPENED
        commission.state = State.TO_PAY
        basis = commission.approval
        commission.approval = None
    elif action == "reject-report":
        event = Event.REPORT_REJECTED
        basis = commission.payment
        commission.payment = None
    elif action == "complete-no-commission":
        event = Event.CLOSED_NO_COMMISSION
        commission.state = State.COMPLETED
        basis = commission.approval or commission.declaration
    elif action == "open-incident":
        commission.incident = True
        event = Event.INCIDENT_OPENED
        basis = commission.payment or commission.approval
    else:
        commission.incident = False
        event = Event.INCIDENT_CLOSED
        basis = commission.events.filter(kind=Event.INCIDENT_OPENED).order_by("-id").first()
    return _event(commission, actor, event, basis=basis, reason=data["reason"])


TRANSITIONS = {
    "declare": _declare,
    "approve": _approve,
    "report-payment": _report,
    "reconcile": _reconcile,
}


def _locked_case(pk, *, provider=None):
    qs = Consumption.objects.select_for_update(of=("self",)).filter(collaborator__isnull=False)
    if provider is not None:
        qs = qs.filter(provider=provider, commission__isnull=False)
    consumption = qs.select_related("collaborator").filter(pk=pk).first()
    if consumption is None:
        raise NotFound()
    commission = Commission.objects.select_for_update(of=("self",)).select_related(
        "approval", "declaration", "payment__basis",
    ).filter(pk=pk).first()
    if commission:
        commission.consumption = consumption
    return consumption, commission


@transaction.atomic
def apply_action(user, *, admin, pk, action, key, data, payload):
    actor = _actor(user, admin=admin)
    provider = None
    if not admin:
        provider_id = Consumption.objects.filter(pk=pk, collaborator__isnull=False, commission__isnull=False).values_list(
            "provider_id", flat=True,
        ).first()
        if provider_id is None:
            raise NotFound()
        provider = locked_owned_provider(actor, provider_id)

    consumption, commission = _locked_case(pk, provider=provider)
    fingerprint = digest("command", [admin, pk, action, payload])
    replay = _command_replay(actor, key, fingerprint)
    if replay is not None:
        return replay

    rule = None
    if commission is None or commission.verified_rate is None:
        if action == "approve":
            _rule_lock()
        rule = applicable_rule(consumption.provider_id)
    if not compare_digest(data["version"], version(consumption, commission, rule)):
        conflict("La ficha cambió. Recargala antes de guardar.")
    if action not in actions_for(commission, admin=admin) or action == "bank-details":
        conflict("La acción no está disponible en el estado actual.")
    transition = TRANSITIONS.get(action)
    event = transition(commission, actor, data, rule) if transition else _review(commission, actor, data, action)
    _save(commission, event)
    return _save_command(actor, key, fingerprint, {"id": str(pk), "state": commission.state})


@sensitive_variables("details")
@transaction.atomic
def reveal_bank(user, pk, reason):
    from accounts.bank import reveal_bank_details

    actor = _actor(user, admin=True)
    consumption, commission = _locked_case(pk)
    if "bank-details" not in actions_for(commission, admin=True):
        conflict("La consulta de datos bancarios no está disponible en el estado actual.")
    details = reveal_bank_details(consumption.collaborator.user_id)
    if details is None:
        raise NotFound("El Colaborador no configuró sus datos bancarios.")
    _event(commission, actor, Event.BANK_REVEALED, reason=reason)
    return {"cbu": details["cbu"], "alias": details["alias"]}


def rule_data(provider, rule):
    return {
        "provider_id": str(provider.pk) if provider else None,
        "provider_name": provider.name if provider else None,
        "rate": str(rule.rate) if rule else None,
        "version": str(rule.version) if rule else None,
    }


@transaction.atomic
def update_rule(user, provider_id, *, key, data, payload):
    from administration.commands import record_audit

    actor = _actor(user, admin=True)
    fingerprint = digest("rule-command", [provider_id, payload])
    replay = _command_replay(actor, key, fingerprint)
    if replay is not None:
        return replay
    provider = Provider.objects.select_for_update(no_key=True).filter(pk=provider_id).first() if provider_id else None
    if provider_id and provider is None:
        raise NotFound()
    _rule_lock()
    rule = CommissionRule.objects.select_for_update().filter(provider=provider).first()
    if data["version"] != (rule.version if rule else None):
        conflict("La regla cambió. Recargala antes de guardar.")
    rate = data["rate"]
    if rate is None:
        if rule:
            rule.delete()
            rule = None
    elif rule is None:
        rule = CommissionRule.objects.create(provider=provider, rate=rate)
    elif rule.rate != rate:
        rule.rate, rule.version = rate, uuid.uuid4()
        rule.save(update_fields=["rate", "version"])
    record_audit(actor, "commission-rules.update", "commission-rules", provider_id or "global", ("rate",))
    return _save_command(actor, key, fingerprint, rule_data(provider, rule))
