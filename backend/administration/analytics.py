from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_field,
    inline_serializer,
)
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from analytics.finance import finance_report
from analytics.periods import parse_collaborator_id, parse_page, parse_period
from analytics.referrals import attributed_visit_report

from .permissions import IsProgramAdmin


@extend_schema_field(
    {"type": "string", "enum": ["available", "unavailable"]},
    component_name="AnalyticsLinkedClientsAvailability",
)
class LinkedClientsAvailabilityField(serializers.ChoiceField):
    pass


class LinkedClientsSerializer(serializers.Serializer):
    status = LinkedClientsAvailabilityField(choices=("available", "unavailable"))
    value = serializers.IntegerField(allow_null=True)


class BusinessVisitSerializer(serializers.Serializer):
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField()
    visits = serializers.IntegerField()


class BusinessesSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    results = BusinessVisitSerializer(many=True)


class VisitReportSerializer(serializers.Serializer):
    period = inline_serializer(
        name="AdminAnalyticsPeriod",
        fields={
            "from": serializers.DateField(),
            "to": serializers.DateField(),
            "timezone": serializers.CharField(),
        },
    )
    linked_clients = LinkedClientsSerializer()
    valid_attributed_visits = serializers.IntegerField()
    businesses = BusinessesSerializer()


class AttributedVisitsView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter("from", OpenApiTypes.DATE, OpenApiParameter.QUERY,
                             description="Inicio inclusivo; debe enviarse junto con to."),
            OpenApiParameter("to", OpenApiTypes.DATE, OpenApiParameter.QUERY,
                             description="Fin inclusivo; debe enviarse junto con from."),
            OpenApiParameter("collaborator_id", OpenApiTypes.UUID, OpenApiParameter.QUERY,
                             description="Limita los vínculos y visitas a un colaborador."),
            OpenApiParameter("page", {"type": "integer", "minimum": 1}, OpenApiParameter.QUERY,
                             description="Página de 25 prestadores; predeterminado 1."),
        ],
        responses={200: VisitReportSerializer},
    )
    def get(self, request):
        try:
            period = parse_period(request.query_params)
            collaborator_id = parse_collaborator_id(request.query_params)
            page = parse_page(request.query_params)
            data = attributed_visit_report(
                period, collaborator_id=collaborator_id, page=page,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        return Response(data)
@extend_schema_field(
    {"type": "string", "enum": ["available", "unavailable"]},
    component_name="AdminFinanceMetricAvailability",
)
class FinanceMetricAvailabilityField(serializers.ChoiceField):
    pass


class FinanceCountMetricSerializer(serializers.Serializer):
    status = FinanceMetricAvailabilityField(choices=("available", "unavailable"))
    value = serializers.IntegerField(allow_null=True)


class FinanceMoneyMetricSerializer(serializers.Serializer):
    status = FinanceMetricAvailabilityField(choices=("available", "unavailable"))
    value = serializers.DecimalField(max_digits=20, decimal_places=2, allow_null=True, coerce_to_string=True)


class FinanceCreditMovementMetricSerializer(FinanceCountMetricSerializer):
    value = serializers.IntegerField(
        allow_null=True,
        help_text="Suma firmada de movimientos verificables; el período se filtra por WalletEntry.created_at.",
    )


class FinanceCreditRedemptionMetricSerializer(FinanceCountMetricSerializer):
    value = serializers.IntegerField(
        allow_null=True,
        help_text="Cantidad de pedidos canjeados con créditos y débito concordante; el período se filtra por Order.created_at.",
    )


class FinanceConfirmedMoneyMetricSerializer(FinanceMoneyMetricSerializer):
    value = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        allow_null=True,
        coerce_to_string=True,
        help_text="Total ARS filtrado por el timestamp del primer evento autoritativo y verificable OrderAudit.PAID por pedido; no usa Order.created_at.",
    )


class FinanceRefundedMoneyMetricSerializer(FinanceMoneyMetricSerializer):
    value = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        allow_null=True,
        coerce_to_string=True,
        help_text="Total ARS filtrado por el timestamp del primer evento autoritativo y verificable OrderAudit.REFUNDED por pedido; no usa Order.created_at.",
    )


class FinanceUndatedConfirmationCountMetricSerializer(FinanceCountMetricSerializer):
    value = serializers.IntegerField(
        allow_null=True,
        help_text="Pedidos MONEY confirmados sin evento OrderAudit.PAID con fecha confiable. Se cuenta todo el historial, sin aplicar el período solicitado ni sumar a los importes fechados.",
    )


class FinanceReportSerializer(serializers.Serializer):
    period = inline_serializer(
        name="AdminFinanceReportPeriod",
        fields={
            "from": serializers.DateField(),
            "to": serializers.DateField(),
            "timezone": serializers.CharField(),
        },
    )
    valid_visits = inline_serializer(
        name="AdminFinanceVisitMetrics",
        fields={
            "direct": FinanceCountMetricSerializer(),
            "referred": FinanceCountMetricSerializer(),
        },
    )
    credits = inline_serializer(
        name="AdminFinanceCreditMetrics",
        fields={
            "earn": FinanceCreditMovementMetricSerializer(),
            "reversal": FinanceCreditMovementMetricSerializer(),
            "redeem": FinanceCreditMovementMetricSerializer(),
            "refund": FinanceCreditMovementMetricSerializer(),
            "adjustment": FinanceCreditMovementMetricSerializer(),
        },
    )
    shop = inline_serializer(
        name="AdminFinanceShopMetrics",
        fields={
            "credit_redemptions": FinanceCreditRedemptionMetricSerializer(),
            "confirmed_ars": FinanceConfirmedMoneyMetricSerializer(),
            "refunded_ars": FinanceRefundedMoneyMetricSerializer(),
            "undated_confirmations_count": FinanceUndatedConfirmationCountMetricSerializer(),
        },
    )


class AdminFinanceAnalyticsView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "from",
                OpenApiTypes.DATE,
                OpenApiParameter.QUERY,
                description="Inicio inclusivo; debe enviarse junto con to.",
            ),
            OpenApiParameter(
                "to",
                OpenApiTypes.DATE,
                OpenApiParameter.QUERY,
                description="Fin inclusivo; debe enviarse junto con from.",
            ),
        ],
        responses={200: FinanceReportSerializer},
    )
    def get(self, request):
        try:
            period = parse_period(request.query_params)
            data = finance_report(period)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        return Response(data)
