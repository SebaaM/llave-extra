from decimal import Decimal

from django.db.models import BooleanField, Case, CharField, DecimalField, F, Sum, Value, When
from django.urls import path
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from credits.models import Consumption

from .models import CommissionState


class IsCollaborator(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.is_active and user.role == User.Role.COLLABORATOR


class CollaboratorCommissionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class CollaboratorCommissionItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    created_at = serializers.DateTimeField()
    provider_name = serializers.CharField()
    benefit_title = serializers.CharField(allow_null=True)
    state = serializers.CharField()
    rate = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    approved_amount = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    payment_reported = serializers.BooleanField()


class CollaboratorCommissionPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    pending_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    results = CollaboratorCommissionItemSerializer(many=True)


class CollaboratorCommissionView(APIView):
    permission_classes = [IsCollaborator]

    @extend_schema(
        operation_id="collaborator_commissions_list",
        responses=CollaboratorCommissionPageSerializer,
    )
    def get(self, request):
        collaborator_id = request.user.pk
        rows = Consumption.objects.filter(collaborator__user_id=collaborator_id).select_related(
            "provider", "commission__approval",
        ).annotate(
            commission_state=Case(
                When(commission__isnull=True, annulled_at__isnull=False, then=Value(CommissionState.ANNULLED)),
                When(commission__isnull=True, benefit_demo=True, then=Value(CommissionState.DEMO)),
                When(commission__isnull=True, then=Value(CommissionState.HISTORICAL)),
                default=F("commission__state"), output_field=CharField(),
            ),
            applied_rate=Case(
                When(commission__approval__isnull=False, then=F("commission__approval__rate")),
                default=F("commission__verified_rate"),
                output_field=DecimalField(max_digits=5, decimal_places=2),
            ),
            approved_amount=F("commission__approval__amount"),
            payment_reported=Case(
                When(commission__payment__isnull=False, then=Value(True)), default=Value(False),
                output_field=BooleanField(),
            ),
        ).order_by("-created_at", "-pk")

        # The aggregate includes all eligible obligations, not just the current page.
        pending_total = rows.filter(
            commission__state=CommissionState.TO_PAY,
            commission__approval__amount__gt=Decimal("0"),
        ).aggregate(total=Sum("commission__approval__amount"))["total"] or Decimal("0.00")

        paginator = CollaboratorCommissionPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        results = [{
            "id": str(row.pk),
            "created_at": row.created_at,
            "provider_name": row.provider.name,
            "benefit_title": row.benefit_title or None,
            "state": row.commission_state,
            "rate": row.applied_rate,
            "approved_amount": row.approved_amount,
            "payment_reported": row.payment_reported,
        } for row in page]
        payload = paginator.get_paginated_response(results).data
        payload["pending_total"] = pending_total
        response = Response(CollaboratorCommissionPageSerializer(payload).data)
        response["Cache-Control"] = "private, no-store"
        return response


urlpatterns = [
    path("collaborator/commissions/", CollaboratorCommissionView.as_view(), name="collaborator-commissions"),
]
