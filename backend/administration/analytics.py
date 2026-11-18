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
