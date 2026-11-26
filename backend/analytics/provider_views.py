from django.contrib.postgres.expressions import ArraySubquery
from django.db.models import Count, Subquery, Value
from django.db.models.functions import Coalesce, JSONObject
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import permissions, serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from analytics.periods import parse_period
from analytics.provenance import exclude_activity_demo_tourists
from credits.models import Consumption
from providers.access import owned_provider
from providers.models import ProviderMembership

BENEFIT_ROWS_LIMIT = 25


class ProviderBenefitVisitSerializer(serializers.Serializer):
    benefit_id = serializers.UUIDField(allow_null=True)
    benefit_title = serializers.CharField(allow_null=True)
    visits = serializers.IntegerField()


class ProviderVisitsReportSerializer(serializers.Serializer):
    period = inline_serializer(
        name="ProviderAnalyticsPeriod",
        fields={
            "from": serializers.DateField(),
            "to": serializers.DateField(),
            "timezone": serializers.CharField(),
        },
    )
    direct_visits = serializers.IntegerField()
    referred_visits = serializers.IntegerField()
    benefits = ProviderBenefitVisitSerializer(many=True)
    other_benefit_visits = serializers.IntegerField()


class ProviderVisitsAnalyticsView(APIView):
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
        ],
        responses={200: ProviderVisitsReportSerializer},
    )
    def get(self, request):
        assigned_provider_id = ProviderMembership.objects.filter(
            user=request.user,
        ).values_list("provider_id", flat=True).first()
        if assigned_provider_id is None:
            raise NotFound()

        provider = owned_provider(request.user, assigned_provider_id)
        try:
            period = parse_period(request.query_params)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc

        visits = exclude_activity_demo_tourists(Consumption.objects.filter(
            provider_id=provider.pk,
            provider__demo=False,
            state=Consumption.State.VALID,
            benefit_demo=False,
            **period.datetime_filters(),
        ))
        direct_visits = (
            visits.filter(collaborator__isnull=True)
            .order_by()
            .values("provider_id")
            .annotate(visits=Count("pk"))
            .values("visits")[:1]
        )
        referred_visits = (
            visits.filter(collaborator__isnull=False)
            .order_by()
            .values("provider_id")
            .annotate(visits=Count("pk"))
            .values("visits")[:1]
        )
        benefit_rows = (
            visits.filter(collaborator__isnull=False)
            .order_by()
            .values("benefit_id", "benefit_title")
            .annotate(visits=Count("pk"))
            .order_by("-visits", "benefit_title", "benefit_id")
            .annotate(
                row=JSONObject(
                    benefit_id="benefit_id",
                    benefit_title="benefit_title",
                    visits="visits",
                ),
            )
            .values("row")[:BENEFIT_ROWS_LIMIT]
        )
        report = (
            ProviderMembership.objects.filter(
                user_id=request.user.pk,
                provider_id=provider.pk,
                user__is_active=True,
                user__role=User.Role.PROVIDER,
            )
            .annotate(
                direct_visits=Coalesce(Subquery(direct_visits), Value(0)),
                referred_visits=Coalesce(Subquery(referred_visits), Value(0)),
                report_benefits=ArraySubquery(benefit_rows),
            )
            .values("direct_visits", "referred_visits", "report_benefits")
            .first()
        )
        if report is None:
            request.user.refresh_from_db(fields=("is_active", "role"))
            if not request.user.is_active or request.user.role != User.Role.PROVIDER:
                raise PermissionDenied("Solo prestadores activos")
            raise NotFound()

        benefits = report["report_benefits"] or []
        for benefit in benefits:
            if benefit["benefit_id"] is None:
                benefit["benefit_title"] = None

        return Response({
            "period": period.as_dict(),
            "direct_visits": report["direct_visits"],
            "referred_visits": report["referred_visits"],
            "benefits": benefits,
            "other_benefit_visits": report["referred_visits"] - sum(
                row["visits"] for row in benefits
            ),
        })