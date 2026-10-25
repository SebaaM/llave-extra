from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from credits.models import AdjustmentCase, Consumption, ProviderCreditRule
from credits.services import (
    Conflict,
    annul_consumption,
    resolve_adjustment,
    rotate_provider_qr,
    set_provider_pin,
)
from providers.catalog import catalog_benefits
from providers.models import Benefit, FolderBenefit, Provider, ProviderMembership
from referrals.models import CollaboratorProfile
from shop.models import CancellationRequest, Order, PaymentOperation, Product
from shop.payments.processing import request_refund, retry_operation
from shop.services import adjust_stock, advance_order, require_admin, resolve_cancellation

from .commands import CommandResult, record_audit, run_command
from .concurrency import require_version
from .permissions import IsProgramAdmin
from .serializers import StrictSerializer


class EmptyAction(StrictSerializer):
    version = serializers.CharField(required=False)


class MemberAction(EmptyAction):
    user_id = serializers.IntegerField(min_value=1)
    reassign = serializers.BooleanField(required=False, default=False)


class UnassignAction(EmptyAction):
    user_id = serializers.IntegerField(min_value=1)


class PinAction(EmptyAction):
    pin = serializers.RegexField(r"^[0-9]{6,12}$", write_only=True)


class BenefitAction(EmptyAction):
    benefit_id = serializers.UUIDField()


class ReasonAction(EmptyAction):
    reason = serializers.CharField(max_length=500, trim_whitespace=True, allow_blank=False)


class ResolveAction(ReasonAction):
    resolution = serializers.ChoiceField(choices=AdjustmentCase.Resolution.choices)


class StockAction(ReasonAction):
    delta = serializers.IntegerField(min_value=-1_000_000, max_value=1_000_000)

    def validate_delta(self, value):
        if value == 0:
            raise ValidationError("La variación no puede ser cero.")
        return value


ACTION_INPUT = {
    ("providers", "assign-user"): MemberAction,
    ("providers", "unassign-user"): UnassignAction,
    ("providers", "set-pin"): PinAction,
    ("providers", "rotate-qr"): EmptyAction,
    ("collaborators", "enable"): EmptyAction,
    ("collaborators", "disable"): EmptyAction,
    ("collaborators", "rotate-qr"): EmptyAction,
    ("collaborators", "add-benefit"): BenefitAction,
    ("collaborators", "remove-benefit"): BenefitAction,
    ("consumptions", "annul"): ReasonAction,
    ("adjustments", "resolve"): ResolveAction,
    ("products", "adjust-stock"): StockAction,
    ("orders", "prepare"): ReasonAction,
    ("orders", "deliver"): ReasonAction,
    ("orders", "refund"): ReasonAction,
    ("cancellations", "approve"): ReasonAction,
    ("cancellations", "reject"): ReasonAction,
    ("payment-operations", "retry"): ReasonAction,
    ("credit-rules", "remove"): EmptyAction,
}


class ActionView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(request=PolymorphicProxySerializer(
        component_name="AdminActionInput", resource_type_field_name=None,
        serializers=[EmptyAction, MemberAction, UnassignAction, PinAction, BenefitAction,
                     ReasonAction, ResolveAction, StockAction],
    ), responses={200: OpenApiTypes.OBJECT})
    def post(self, request, resource, pk, action):
        input_type = ACTION_INPUT.get((resource, action))
        if input_type is None:
            raise ValidationError({"action": "Acción inexistente."})
        serializer = input_type(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        result = run_command(
            request.user, f"{resource}.{action}", request.headers.get("Idempotency-Key"),
            {"id": str(pk), **{name: str(value) if name == "benefit_id" else value for name, value in data.items()}},
            lambda: execute_action(request.user, resource, pk, action, data),
        )
        return Response(result.data, status=result.status_code)


def _versioned(model, pk, version):
    obj = get_object_or_404(model.objects.select_for_update(), pk=pk)
    require_version(obj, version)
    return obj


def execute_action(actor, resource, pk, action, data):
    require_admin(actor)
    version = data.get("version")
    reason = data.get("reason", "")
    if resource == "providers":
        if action in ("assign-user", "unassign-user"):
            # User before Provider, then membership; unique(user) enforces one business.
            user = get_object_or_404(User.objects.select_for_update(), pk=data["user_id"])
            if user.role != User.Role.PROVIDER or not user.is_active:
                raise ValidationError({"user_id": "Se requiere usuario Prestador activo."})
            provider = _versioned(Provider, pk, version)
            existing = ProviderMembership.objects.select_for_update().filter(user=user).first()
            if action == "assign-user":
                if existing and existing.provider_id != provider.pk and not data["reassign"]:
                    raise Conflict("El usuario ya pertenece a otro prestador; indicá reasignación explícita.")
                if existing and existing.provider_id != provider.pk:
                    existing.delete()
                ProviderMembership.objects.get_or_create(user=user, provider=provider)
            else:
                if not existing or existing.provider_id != provider.pk:
                    raise Conflict("El usuario no pertenece a este prestador.")
                existing.delete()
            record_audit(actor, f"providers.{action}", resource, pk, ("memberships",))
            return CommandResult({"id": str(pk), "user_id": user.pk, "assigned": action == "assign-user"})
        _versioned(Provider, pk, version)
        if action == "set-pin":
            set_provider_pin(pk, data["pin"])
        else:
            rotate_provider_qr(pk)
        record_audit(actor, f"providers.{action}", resource, pk)
        return CommandResult({"id": str(pk), "status": "updated"})
    if resource == "collaborators":
        profile = _versioned(CollaboratorProfile, pk, version)
        if action in ("enable", "disable"):
            if profile.user.role != User.Role.COLLABORATOR or not profile.user.is_active:
                raise Conflict("El titular debe ser Colaborador activo.")
            CollaboratorProfile.set_enabled(pk, action == "enable")
            changed = ("enabled",)
        elif action == "rotate-qr":
            CollaboratorProfile.rotate(pk)
            changed = ()
        else:
            benefit_id = data["benefit_id"]
            try:
                FolderBenefit.lock_target(pk, benefit_id)
                if action == "add-benefit":
                    if not catalog_benefits().filter(pk=benefit_id).exists():
                        raise Conflict("El beneficio no está publicado o vigente.")
                    FolderBenefit.assign(pk, benefit_id)
                else:
                    FolderBenefit.remove(pk, benefit_id)
            except Benefit.DoesNotExist:
                raise ValidationError({"benefit_id": "Beneficio inexistente."}) from None
            changed = ("folder_benefits",)
        record_audit(actor, f"collaborators.{action}", resource, pk, changed)
        return CommandResult({"id": str(pk), "status": "updated"})
    if resource == "consumptions":
        get_object_or_404(Consumption, pk=pk)
        case = annul_consumption(pk, actor, reason)
        record_audit(actor, "consumptions.annul", resource, pk, ("state",), reason)
        return CommandResult({"id": str(pk), "state": "ANNULLED", "adjustment_id": str(case.pk) if case else None})
    if resource == "adjustments":
        get_object_or_404(AdjustmentCase, pk=pk)
        case = resolve_adjustment(pk, actor, data["resolution"], reason)
        record_audit(actor, "adjustments.resolve", resource, pk, ("resolution",), reason)
        return CommandResult({"id": str(pk), "resolution": case.resolution})
    if resource == "products":
        _versioned(Product, pk, version)
        adjustment = adjust_stock(actor, pk, delta=data["delta"], reason=reason)
        record_audit(actor, "products.adjust-stock", resource, pk, ("stock",), reason)
        return CommandResult({"id": str(pk), "stock": adjustment.resulting_stock, "adjustment_id": adjustment.pk})
    if resource == "orders":
        get_object_or_404(Order, pk=pk)
        if action == "refund":
            request_refund(actor, pk, reason=reason)
            state = Order.objects.values_list("state", flat=True).get(pk=pk)
        else:
            target = Order.State.READY if action == "prepare" else Order.State.PICKED_UP
            state = advance_order(actor, pk, target=target, reason=reason).state
        record_audit(actor, f"orders.{action}", resource, pk, ("state",), reason)
        return CommandResult({"id": str(pk), "state": state})
    if resource == "cancellations":
        get_object_or_404(CancellationRequest, pk=pk)
        row = resolve_cancellation(actor, pk, approve=action == "approve", reason=reason)
        record_audit(actor, f"cancellations.{action}", resource, pk, ("state",), reason)
        return CommandResult({"id": str(pk), "state": row.state})
    if resource == "payment-operations":
        get_object_or_404(PaymentOperation, pk=pk)
        retry_operation(actor, pk, reason=reason)
        record_audit(actor, "payment-operations.retry", resource, pk, ("state",), reason)
        return CommandResult({"id": str(pk), "state": "PENDING"})
    if resource == "credit-rules":
        rule = get_object_or_404(ProviderCreditRule, pk=pk)
        Provider.objects.select_for_update().get(pk=rule.provider_id)
        rule = _versioned(ProviderCreditRule, pk, version)
        rule.delete()
        record_audit(actor, "credit-rules.remove", resource, pk, ("reward",))
        return CommandResult({"id": str(pk), "removed": True})
    raise ValidationError({"action": "Acción inexistente."})
