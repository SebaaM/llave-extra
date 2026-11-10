from django.db.models import Case, CharField, F, OuterRef, Prefetch, Q, Subquery, Value, When
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import CollaboratorBankDetails, User
from administration.permissions import IsProgramAdmin
from credits.models import Consumption
from providers.models import Provider, ProviderMembership

from .models import CommissionEvent, CommissionRule
from .models import CommissionState as State
from .models import EventKind as Event
from .serializers import (
    ACTION_REQUESTS,
    ActionResponseSerializer,
    AdminCommissionSerializer,
    BankRevealRequestSerializer,
    BankRevealResponseSerializer,
    CommissionFilterSerializer,
    CommissionSerializer,
    RuleListSerializer,
    RuleRequestSerializer,
    RuleSerializer,
)
from .services import (
    actions_for,
    apply_action,
    effective_approval,
    late_approvals,
    next_step,
    reveal_bank,
    rule_data,
    update_rule,
    version,
)

IDEMPOTENCY_KEY = OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)


class IsProvider(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.is_active and user.role == User.Role.PROVIDER


class CommissionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def _cases(user, *, admin):
    cases = Consumption.objects.filter(collaborator__isnull=False)
    if not admin:
        provider = ProviderMembership.objects.filter(user=user).values("provider_id")
        cases = cases.filter(provider_id__in=provider, commission__isnull=False)
    cases = cases.select_related(
        "provider", "collaborator__user", "commission__declaration", "commission__approval", "commission__payment__basis",
    ).prefetch_related(Prefetch(
        "commission__events",
        queryset=CommissionEvent.objects.order_by("id") if admin else
        CommissionEvent.objects.exclude(kind=Event.BANK_REVEALED).order_by("id"),
        to_attr="visible_events",
    )).annotate(
        commission_state=Case(
            When(commission__isnull=False, then=F("commission__state")),
            When(benefit_demo=True, then=Value(State.DEMO)),
            default=Value(State.HISTORICAL), output_field=CharField(),
        ),
    )
    if admin:
        bank_version = CollaboratorBankDetails.objects.filter(
            user_id=OuterRef("collaborator__user_id"),
        ).values("version")
        cases = cases.select_related("tourist", "annulled_by").annotate(bank_version=Subquery(bank_version))
    return cases.order_by("-created_at", "-pk")


def _name(user):
    return user.get_full_name().strip() or user.get_role_display()


def _timeline_event(*, kind, created_at, actor, reason, event=None):
    reconciled = event is not None and kind == Event.PAYMENT_RECONCILED
    return {
        "id": event.pk if event else None, "basis_id": event.basis_id if event else None,
        "kind": kind, "label": Event(kind).label, "created_at": created_at, "actor": actor, "reason": reason,
        "outcome": (event.outcome or None) if event else None, "amount": event.amount if event else None,
        "base_amount": event.base_amount if event else None, "rate": event.rate if event else None,
        "reference": (event.reference or None) if event else None, "date": event.date if event else None,
        "receipt_checked": event.receipt_checked if reconciled else None,
        "receipt_confirmed": event.receipt_confirmed if reconciled else None,
    }


def _timeline(consumption, commission, *, admin):
    if commission:
        return [
            _timeline_event(
                kind=event.kind, created_at=event.created_at, event=event,
                actor="Cliente" if not admin and event.kind == Event.VERIFIED else event.actor_name,
                reason=event.reason if admin or event.kind in (
                    Event.CORRECTION_REQUESTED, Event.REPORT_REJECTED, Event.REOPENED,
                ) else "",
            )
            for event in commission.visible_events
            if event.id <= commission.last_event_id or event.kind == Event.BANK_REVEALED
        ]
    events = [_timeline_event(
        kind=Event.VERIFIED, created_at=consumption.created_at, actor=_name(consumption.tourist), reason="",
    )]
    if consumption.annulled_at:
        events.append(_timeline_event(
            kind=Event.ANNULLED, created_at=consumption.annulled_at,
            actor=_name(consumption.annulled_by), reason=consumption.annul_reason,
        ))
    return events


def _serialize(cases, *, admin):
    providers = {case.provider_id for case in cases}
    rules = {
        rule.provider_id: rule for rule in CommissionRule.objects.filter(
            Q(provider_id__in=providers) | Q(provider__isnull=True),
        )
    }
    for case in cases:
        commission = getattr(case, "commission", None)
        rule = rules.get(case.provider_id, rules.get(None))
        actions = actions_for(commission, admin=admin)
        if rule is None and "approve" in actions:
            actions.remove("approve")
        approval = effective_approval(commission) if commission else None
        item = {
            "id": case.pk, "created_at": case.created_at,
            "provider_id": case.provider_id, "provider_name": case.provider.name,
            "collaborator_id": case.collaborator_id, "collaborator_name": _name(case.collaborator.user),
            "benefit_title": case.benefit_title,
            "state": case.commission_state, "next_step": next_step(case.commission_state, commission, rule),
            "version": version(case, commission, rule), "declaration": commission.declaration if commission else None,
            "approval": approval, "payment": commission.payment if commission else None,
            "payment_approvals": late_approvals(commission),
            "events": _timeline(case, commission, admin=admin), "actions": actions,
            "incident": bool(commission and commission.incident), "current_rate": rule.rate if rule else None,
        }
        if admin:
            item.update(
                tourist_name=_name(case.tourist), bank_configured=case.bank_version is not None,
                bank_changed=bool(approval and approval.bank_version and approval.bank_version != case.bank_version),
            )
        yield item


class PrivateView(APIView):
    admin = True

    def get_permissions(self):
        return [IsProgramAdmin() if self.admin else IsProvider()]

    def finalize_response(self, *args, **kwargs):
        response = super().finalize_response(*args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class CommissionListView(PrivateView):
    def get(self, request):
        filters = CommissionFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        cases = _cases(request.user, admin=self.admin)
        for name, value in filters.validated_data.items():
            if name == "provider" and not self.admin:
                raise ValidationError({"provider": "El Prestador se determina por la sesión."})
            cases = cases.filter(**{f"{name}_id" if name != "state" else "commission_state": value})
        pagination = CommissionPagination()
        page = pagination.paginate_queryset(cases, request, view=self)
        data = _serialize(page, admin=self.admin)
        serializer = AdminCommissionSerializer if self.admin else CommissionSerializer
        return pagination.get_paginated_response(serializer(list(data), many=True).data)


class CommissionDetailView(PrivateView):
    def get(self, request, pk):
        consumption = get_object_or_404(_cases(request.user, admin=self.admin), pk=pk)
        item = next(_serialize([consumption], admin=self.admin))
        serializer = AdminCommissionSerializer if self.admin else CommissionSerializer
        return Response(serializer(item).data)


class ActionView(PrivateView):
    action = None

    def post(self, request, pk):
        serializer = ACTION_REQUESTS[self.action](data=request.data)
        serializer.is_valid(raise_exception=True)
        result = apply_action(
            request.user, admin=self.admin, pk=pk, action=self.action,
            key=request.headers.get("Idempotency-Key"), data=serializer.validated_data, payload=request.data,
        )
        return Response(ActionResponseSerializer(result).data)


class BankRevealView(PrivateView):
    @extend_schema(request=BankRevealRequestSerializer, responses=BankRevealResponseSerializer)
    def post(self, request, pk):
        serializer = BankRevealRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(reveal_bank(request.user, pk, serializer.validated_data["reason"]))


class RuleListView(PrivateView):
    @extend_schema(responses=RuleListSerializer)
    def get(self, request):
        rules = {rule.provider_id: rule for rule in CommissionRule.objects.all()}
        result = {
            "global": rule_data(None, rules.get(None)),
            "providers": [
                rule_data(provider, rules.get(provider.pk))
                for provider in Provider.objects.order_by("name", "pk").only("name")
            ],
        }
        return Response(RuleListSerializer(result).data)


class RuleWriteView(PrivateView):
    @extend_schema(request=RuleRequestSerializer, responses=RuleSerializer, parameters=[IDEMPOTENCY_KEY])
    def put(self, request, provider_id=None):
        serializer = RuleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = update_rule(
            request.user, provider_id, key=request.headers.get("Idempotency-Key"),
            data=serializer.validated_data, payload=request.data,
        )
        return Response(RuleSerializer(result).data)
