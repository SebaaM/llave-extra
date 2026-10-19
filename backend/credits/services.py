import hashlib
import hmac
import json
import uuid

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from accounts.models import User
from accounts.security import rate_limit
from providers.access import locked_provider_eligibility
from providers.models import Provider

from .models import (
    AdjustmentCase,
    Consumption,
    ConsumptionIdempotency,
    CreditPolicy,
    ProviderConsumptionCredential,
    ProviderCreditRule,
    Wallet,
    WalletEntry,
)

QR_SALT = "llave-extra.provider-consumption.v1"


class Conflict(APIException):
    status_code = 409
    default_detail = "Conflicto con una operación anterior"


def sign_provider_qr(credential: ProviderConsumptionCredential) -> str:
    return signing.dumps({"id": str(credential.provider_id), "v": credential.qr_version},
                         key=settings.QR_SIGNING_KEY, salt=QR_SALT, compress=False)


def parse_provider_qr(token: str) -> tuple[uuid.UUID, int]:
    try:
        data = signing.loads(token, key=settings.QR_SIGNING_KEY, salt=QR_SALT)
        if set(data) != {"id", "v"} or type(data["v"]) is not int or data["v"] < 1:
            raise ValueError
        return uuid.UUID(str(data["id"])), data["v"]
    except (signing.BadSignature, ValueError, TypeError, KeyError):
        raise ValidationError({"qr_token": "QR de prestador inválido"}) from None


def set_provider_pin(provider_id, raw_pin: str) -> None:
    if not raw_pin.isdigit() or not 6 <= len(raw_pin) <= 12:
        raise ValidationError({"pin": "El PIN debe tener entre 6 y 12 dígitos"})
    with transaction.atomic():
        Provider.objects.select_for_update().get(pk=provider_id)
        credential, _ = ProviderConsumptionCredential.objects.select_for_update().get_or_create(provider_id=provider_id)
        credential.pin_hash = make_password(raw_pin)
        credential.save(update_fields=["pin_hash"])


def rotate_provider_qr(provider_id) -> None:
    with transaction.atomic():
        Provider.objects.select_for_update().get(pk=provider_id)
        credential, _ = ProviderConsumptionCredential.objects.select_for_update().get_or_create(provider_id=provider_id)
        credential.qr_version += 1
        credential.save(update_fields=["qr_version"])


def _wallet_locked(tourist_id) -> Wallet:
    # Caller holds the User lock before calling. One wallet per tourist is a DB invariant.
    Wallet.objects.get_or_create(tourist_id=tourist_id)
    return Wallet.objects.select_for_update().get(tourist_id=tourist_id)


def _entry(wallet: Wallet, kind: str, delta: int, reference: str,
           *, source_entry: WalletEntry | None = None) -> WalletEntry | None:
    if delta == 0:
        return None
    source_id = source_entry.pk if source_entry else None

    def matching(existing):
        if (existing.wallet_id != wallet.pk or existing.kind != kind or existing.delta != delta
                or existing.source_entry_id != source_id):
            raise Conflict("Referencia financiera reutilizada con otros datos")
        return existing

    existing = WalletEntry.objects.filter(reference=reference).first()
    if existing:
        return matching(existing)
    if wallet.balance + delta < 0:
        raise Conflict("Saldo insuficiente")
    if wallet.balance + delta > 2**63 - 1:
        raise Conflict("Límite de saldo excedido")
    try:
        with transaction.atomic():
            wallet.balance += delta
            wallet.save(update_fields=["balance"])
            return WalletEntry.objects.create(wallet=wallet, kind=kind, delta=delta,
                                              reference=reference, source_entry=source_entry)
    except IntegrityError:
        wallet.refresh_from_db()
        existing = WalletEntry.objects.filter(reference=reference).first()
        if existing:
            return matching(existing)
        raise Conflict("Movimiento financiero inválido") from None


def credit_wallet(tourist_id, amount: int, reference: str, *, kind=WalletEntry.Kind.EARN) -> WalletEntry | None:
    """Credit in caller transaction. Lock order User -> Wallet; reference is unique business event."""
    if not transaction.get_connection().in_atomic_block or amount < 0:
        raise ValueError("Se requiere transacción y monto no negativo")
    User.objects.select_for_update().get(pk=tourist_id)
    return _entry(_wallet_locked(tourist_id), kind, amount, reference)


def debit_wallet(tourist_id, amount: int, reference: str) -> WalletEntry:
    """E5: call inside order transaction; lock User -> Wallet before order/stock locks."""
    if not transaction.get_connection().in_atomic_block or amount <= 0:
        raise ValueError("Se requiere transacción y monto positivo")
    user = User.objects.select_for_update().get(pk=tourist_id)
    if not user.is_active or not user.email_verified or user.role != User.Role.TOURIST:
        raise PermissionDenied("Cliente activo con email verificado requerido")
    wallet = _wallet_locked(tourist_id)
    prior = WalletEntry.objects.filter(reference=reference).first()
    if wallet.redemptions_frozen and prior is None:
        raise Conflict("Canjes bloqueados por ajuste pendiente")
    return _entry(wallet, WalletEntry.Kind.REDEEM, -amount, reference)


def refund_wallet(tourist_id, amount: int, reference: str, *, debit_reference: str) -> WalletEntry:
    """E5: refund a recorded debit at most once in aggregate, within caller transaction."""
    if not transaction.get_connection().in_atomic_block or amount <= 0:
        raise ValueError("Se requiere transacción y monto positivo")
    User.objects.select_for_update().get(pk=tourist_id)
    wallet = _wallet_locked(tourist_id)
    debit = WalletEntry.objects.filter(reference=debit_reference, wallet=wallet,
                                       kind=WalletEntry.Kind.REDEEM).first()
    if debit is None:
        raise ValidationError("Débito original inexistente")
    prior = WalletEntry.objects.filter(reference=reference).first()
    if prior:
        return _entry(wallet, WalletEntry.Kind.REFUND, amount, reference, source_entry=debit)
    refunded = WalletEntry.objects.filter(source_entry=debit, kind=WalletEntry.Kind.REFUND).aggregate(
        total=Sum("delta"))["total"] or 0
    if refunded + amount > -debit.delta:
        raise Conflict("El reintegro excede el canje original")
    return _entry(wallet, WalletEntry.Kind.REFUND, amount, reference, source_entry=debit)


def _fingerprint(folder_id, token: str, pin: str) -> str:
    payload = json.dumps([str(folder_id), token, pin], separators=(",", ":"))
    return hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def award_consumption(user: User, folder_id, qr_token: str, pin: str, key: str, *, origin: str | None = None):
    digest = _fingerprint(folder_id, qr_token, pin)
    with transaction.atomic():
        actor = User.objects.select_for_update().get(pk=user.pk)
        if not actor.is_active or actor.role != User.Role.TOURIST:
            raise PermissionDenied("Solo clientes activos pueden acreditar")
        prior = ConsumptionIdempotency.objects.filter(actor=actor, operation="consume", key=key).first()
        if prior:
            if hmac.compare_digest(prior.fingerprint, digest):
                return prior.response, prior.status_code
            if origin is not None:
                rate_limit("consumption", f"origin:{origin}")
            rate_limit("consumption", f"account:{actor.pk}")
            rate_limit("consumption", f"account-provider:{actor.pk}:{prior.response['provider_id']}")
            raise Conflict("La clave de idempotencia ya se usó con otros datos")
        if origin is not None:
            rate_limit("consumption", f"origin:{origin}")
        rate_limit("consumption", f"account:{actor.pk}")
        if not actor.email_verified:
            raise PermissionDenied("Verificá tu email antes de acreditar")
        provider_id, version = parse_provider_qr(qr_token)
        rate_limit("consumption", f"account-provider:{actor.pk}:{provider_id}")
        with locked_provider_eligibility(actor, folder_id, provider_id) as (profile, provider):
            credential = ProviderConsumptionCredential.objects.select_for_update().filter(provider=provider).first()
            if (credential is None or credential.qr_version != version or not credential.pin_hash
                    or not check_password(pin, credential.pin_hash)):
                raise ValidationError({"qr_token": "QR o PIN inválido"})
            existing = Consumption.objects.filter(tourist=actor, provider=provider).first()
            if existing:
                raise Conflict("Consumo ya registrado para este prestador")
            policy, _ = CreditPolicy.objects.select_for_update().get_or_create(singleton=1)
            rule = ProviderCreditRule.objects.select_for_update().filter(provider=provider).first()
            award = rule.reward if rule is not None else policy.base_reward
            source = "provider" if rule is not None else "global"
            consumption = Consumption.objects.create(
                tourist=actor, provider=provider, collaborator=profile, award=award,
                rule_snapshot={"source": source, "amount": award, "target_visits": policy.target_visits},
            )
            if award:
                credit_wallet(actor.pk, award, f"consumption:{consumption.pk}:earn")
            wallet = _wallet_locked(actor.pk)
            response = {"id": str(consumption.pk), "provider_id": str(provider.pk),
                        "collaborator_id": str(profile.pk), "award": award,
                        "balance": wallet.balance, "state": consumption.state,
                        "created_at": consumption.created_at.isoformat()}
            ConsumptionIdempotency.objects.create(actor=actor, operation="consume", key=key,
                                                   fingerprint=digest, response=response, status_code=201)
            return response, 201


def _require_admin(actor: User):
    if not actor.is_active or actor.role != User.Role.ADMIN or not actor.is_superuser:
        raise PermissionDenied("Solo administración")


def annul_consumption(consumption_id, actor: User, reason: str) -> AdjustmentCase | None:
    _require_admin(actor)
    if not reason.strip():
        raise ValidationError({"reason": "Indicá el motivo"})
    with transaction.atomic():
        tourist_id = Consumption.objects.only("tourist_id").get(pk=consumption_id).tourist_id
        User.objects.select_for_update().get(pk=tourist_id)
        wallet = _wallet_locked(tourist_id)
        consumption = Consumption.objects.select_for_update().get(pk=consumption_id)
        if consumption.state == Consumption.State.ANNULLED:
            raise Conflict("El consumo ya fue anulado")
        consumption.state = Consumption.State.ANNULLED
        consumption.annulled_at = timezone.now()
        consumption.annulled_by = actor
        consumption.annul_reason = reason.strip()
        consumption.save(update_fields=["state", "annulled_at", "annulled_by", "annul_reason"])
        if wallet.balance >= consumption.award:
            _entry(wallet, WalletEntry.Kind.REVERSAL, -consumption.award,
                   f"consumption:{consumption.pk}:reversal")
            return None
        case = AdjustmentCase.objects.create(consumption=consumption,
                                             shortfall=consumption.award - wallet.balance)
        wallet.redemptions_frozen = True
        wallet.save(update_fields=["redemptions_frozen"])
        return case


def resolve_adjustment(case_id, actor: User, resolution: str, reason: str) -> AdjustmentCase:
    _require_admin(actor)
    if not reason.strip() or resolution not in AdjustmentCase.Resolution.values:
        raise ValidationError("Resolución y motivo obligatorios")
    with transaction.atomic():
        tourist_id = AdjustmentCase.objects.select_related("consumption").get(pk=case_id).consumption.tourist_id
        User.objects.select_for_update().get(pk=tourist_id)
        wallet = _wallet_locked(tourist_id)
        case = AdjustmentCase.objects.select_for_update().select_related("consumption").get(pk=case_id)
        if case.resolved_at:
            raise Conflict("El ajuste ya fue resuelto")
        award = case.consumption.award
        shortfall = max(award - wallet.balance, 0)
        if resolution == AdjustmentCase.Resolution.REVERSAL:
            if shortfall:
                raise Conflict("Saldo insuficiente para revertir")
        elif resolution == AdjustmentCase.Resolution.FUNDED and shortfall:
            _entry(wallet, WalletEntry.Kind.ADJUSTMENT, shortfall,
                   f"adjustment:{case.pk}:funding")
            case.funded_amount = shortfall
        if resolution == AdjustmentCase.Resolution.FORGIVEN:
            if wallet.balance:
                _entry(wallet, WalletEntry.Kind.REVERSAL, -min(wallet.balance, award),
                       f"consumption:{case.consumption_id}:reversal")
            case.forgiven_amount = shortfall
        else:
            _entry(wallet, WalletEntry.Kind.REVERSAL, -award,
                   f"consumption:{case.consumption_id}:reversal")
        case.resolution = resolution
        case.resolution_reason = reason.strip()
        case.resolved_at = timezone.now()
        case.resolved_by = actor
        case.save(update_fields=["funded_amount", "forgiven_amount", "resolution",
                                 "resolution_reason", "resolved_at", "resolved_by"])
        wallet.redemptions_frozen = AdjustmentCase.objects.filter(
            consumption__tourist_id=tourist_id, resolved_at__isnull=True).exclude(pk=case.pk).exists()
        wallet.save(update_fields=["redemptions_frozen"])
        return case
