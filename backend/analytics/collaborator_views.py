from math import ceil

from django.contrib.postgres.expressions import ArraySubquery
from django.db.models import Count, Max, Q, Subquery, Value
from django.db.models.functions import Coalesce, JSONObject
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_field,
    inline_serializer,
)
from rest_framework import permissions, serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from analytics.periods import BUSINESSES_PAGE_SIZE, parse_page, parse_period
from analytics.provenance import LEGACY_ACCESS_SEED_KEY, exclude_activity_demo_tourists
from credits.models import Consumption
from providers.access import selected_providers
from providers.models import DemoSeedState
from referrals.models import CollaboratorProfile, FolderAccess
from referrals.views import current_profile

POSTGRES_BIGINT_MAX = (1 << 63) - 1


@extend_schema_field(
    {"type": "string", "enum": ["available", "unavailable"]},
    component_name="CollaboratorAnalyticsLinkedClientsAvailability",
)
class CollaboratorLinkedClientsAvailabilityField(serializers.ChoiceField):
    pass


class CollaboratorLinkedClientsSerializer(serializers.Serializer):
    status = CollaboratorLinkedClientsAvailabilityField(choices=("available", "unavailable"))
    value = serializers.IntegerField(allow_null=True)


class CollaboratorBusinessVisitSerializer(serializers.Serializer):
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField()
    visits = serializers.IntegerField()


class CollaboratorVisitsReportSerializer(serializers.Serializer):
    period = inline_serializer(
        name="CollaboratorAnalyticsPeriod",
        fields={
            "from": serializers.DateField(),
            "to": serializers.DateField(),
            "timezone": serializers.CharField(),
        },
    )
    linked_clients = CollaboratorLinkedClientsSerializer()

    valid_attributed_visits = serializers.IntegerField()
    businesses = inline_serializer(
        name="CollaboratorAnalyticsBusinessPage",
        fields={
            "count": serializers.IntegerField(),
            "page": serializers.IntegerField(),
            "page_size": serializers.IntegerField(),
            "results": CollaboratorBusinessVisitSerializer(many=True),
        },
    )
    other_business_visits = serializers.IntegerField()


def collaborator_visit_report(profile, period, *, page):
    offset = (page - 1) * BUSINESSES_PAGE_SIZE
    if offset > POSTGRES_BIGINT_MAX:
        raise ValueError("El parámetro page excede el límite de paginación.")
    visible_provider_ids = selected_providers(profile.pk).order_by().values("pk")
    visits = exclude_activity_demo_tourists(Consumption.objects.filter(
        collaborator_id=profile.pk,
        state=Consumption.State.VALID,
        benefit_demo=False,
        provider__demo=False,
        **period.datetime_filters(),
    ))
    visible_visits = visits.filter(provider_id__in=Subquery(visible_provider_ids))

    total_visits = (
        visits.order_by()
        .values("collaborator_id")
        .annotate(value=Count("pk"))
        .values("value")[:1]
    )
    other_business_visits = (
        visits.exclude(provider_id__in=Subquery(visible_provider_ids))
        .order_by()
        .values("collaborator_id")
        .annotate(value=Count("pk"))
        .values("value")[:1]
    )
    business_count = (
        visible_visits.order_by()
        .values("collaborator_id")
        .annotate(value=Count("provider_id", distinct=True))
        .values("value")[:1]
    )
    business_rows = (
        visible_visits.order_by()
        .values("provider_id", "provider__name")
        .annotate(visits=Count("pk"))
        .order_by("-visits", "provider__name", "provider_id")
        .annotate(
            row=JSONObject(
                provider_id="provider_id",
                provider_name="provider__name",
                visits="visits",
            ),
        )
        .values("row")
    )

    seeded_at = Subquery(
        DemoSeedState.objects.filter(pk=LEGACY_ACCESS_SEED_KEY).values("loaded_at")[:1],
    )
    accesses = exclude_activity_demo_tourists(FolderAccess.objects.filter(
        collaborator_id=profile.pk,
        **period.datetime_filters(),
    ))
    linked_metrics = (
        accesses.order_by()
        .values("collaborator_id")
        .annotate(
            value=Count("tourist_id", distinct=True),
            legacy_overlap=Max("created_at", filter=Q(created_at__lt=seeded_at)),
        )
        .annotate(snapshot=JSONObject(value="value", legacy_overlap="legacy_overlap"))
        .values("snapshot")[:1]
    )

    report = (
        CollaboratorProfile.objects.filter(
            pk=profile.pk,
            enabled=True,
            user__is_active=True,
            user__role=User.Role.COLLABORATOR,
        )
        .annotate(
            report_total=Coalesce(Subquery(total_visits), Value(0)),
            report_other_business_visits=Coalesce(Subquery(other_business_visits), Value(0)),
            report_business_count=Coalesce(Subquery(business_count), Value(0)),
            report_businesses=ArraySubquery(business_rows[offset:offset + BUSINESSES_PAGE_SIZE]),
            report_linked_metrics=Subquery(linked_metrics),
        )
        .values(
            "report_total",
            "report_other_business_visits",
            "report_business_count",
            "report_businesses",
            "report_linked_metrics",
        )
        .first()
    )
    if report is None:
        raise PermissionDenied("Solo colaboradores habilitados")

    business_count_value = report["report_business_count"]
    page_count = max(1, ceil(business_count_value / BUSINESSES_PAGE_SIZE))
    if page > page_count:
        raise ValueError("La página solicitada no existe.")

    linked_metrics_value = report["report_linked_metrics"] or {"value": 0, "legacy_overlap": None}
    linked_is_unavailable = linked_metrics_value["legacy_overlap"] is not None
    return {
        "period": period.as_dict(),
        "linked_clients": {
            "status": "unavailable" if linked_is_unavailable else "available",
            "value": None if linked_is_unavailable else linked_metrics_value["value"],
        },
        "valid_attributed_visits": report["report_total"],
        "businesses": {
            "count": business_count_value,
            "page": page,
            "page_size": BUSINESSES_PAGE_SIZE,
            "results": report["report_businesses"] or [],
        },
        "other_business_visits": report["report_other_business_visits"],
    }


class CollaboratorVisitsAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response

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
            OpenApiParameter(
                "page",
                OpenApiTypes.INT,
                OpenApiParameter.QUERY,
                description="Página de 25 negocios.",
            ),
        ],
        responses={200: CollaboratorVisitsReportSerializer},
    )
    def get(self, request):
        profile = current_profile(request.user)
        try:
            period = parse_period(request.query_params)
            page = parse_page(request.query_params)
            report = collaborator_visit_report(profile, period, page=page)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(report)