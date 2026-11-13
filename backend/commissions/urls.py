from django.urls import path
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import serializers

from .benefit_rates import BenefitRateView
from .serializers import (
    ACTION_REQUESTS,
    ActionResponseSerializer,
    AdminCommissionSerializer,
    CommissionFilterSerializer,
    CommissionSerializer,
)
from .views import (
    IDEMPOTENCY_KEY,
    ActionView,
    BankRevealView,
    CommissionDetailView,
    CommissionListView,
    RuleListView,
    RuleWriteView,
)

urlpatterns = [
    path(
        "provider/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/commission-rate/",
        BenefitRateView.as_view(), name="provider-benefit-commission-rate",
    ),
    path("admin/commission-rules/", RuleListView.as_view(), name="commission-rules"),
    path("admin/commission-rules/global/", RuleWriteView.as_view(), name="commission-rules-global"),
    path("admin/commission-rules/providers/<uuid:provider_id>/", RuleWriteView.as_view(), name="commission-rules-provider"),
    path("admin/commissions/<uuid:pk>/bank-details/", BankRevealView.as_view(), name="admin-commission-bank-details"),
]


def _documented_view(view, name, *, init, method="get", **schema):
    # Each route needs its own schema without mutating the shared APIView class.
    route_view = type(name, (view,), {"__module__": __name__})
    return extend_schema_view(**{method: extend_schema(**schema)})(route_view).as_view(**init)


def _routes(role, response):
    admin = role == "admin"
    prefix = f"{role}/commissions/"
    paginated = inline_serializer(
        f"{role.title()}CommissionPage",
        fields={
            "count": serializers.IntegerField(),
            "next": serializers.URLField(allow_null=True),
            "previous": serializers.URLField(allow_null=True),
            "results": response(many=True),
        },
    )
    actions = (
        ("request-correction", "approve", "complete-no-commission", "reconcile",
         "reopen", "reject-report", "open-incident", "close-incident")
        if admin else ("declare", "report-payment")
    )
    pagination = [
        OpenApiParameter("page", {"type": "integer", "minimum": 1}),
        OpenApiParameter("page_size", {"type": "integer", "minimum": 1, "maximum": 100, "default": 20}),
    ]
    filters = CommissionFilterSerializer()
    if not admin:
        filters.fields.pop("provider")
    return [
        path(
            prefix,
            _documented_view(
                CommissionListView, f"{role.title()}CommissionListView", init={"admin": admin},
                operation_id=f"{role}_commissions_list", responses=paginated, parameters=[filters, *pagination],
            ),
            name=f"{role}-commission-list",
        ),
        path(
            prefix + "<uuid:pk>/",
            _documented_view(
                CommissionDetailView, f"{role.title()}CommissionDetailView", init={"admin": admin},
                operation_id=f"{role}_commissions_retrieve", responses=response,
            ),
            name=f"{role}-commission-detail",
        ),
        *[
            path(
                prefix + f"<uuid:pk>/actions/{action}/",
                _documented_view(
                    ActionView, f"{role.title()}{action.title().replace('-', '')}View", init={"admin": admin, "action": action},
                    method="post", request=ACTION_REQUESTS[action], responses=ActionResponseSerializer,
                    parameters=[IDEMPOTENCY_KEY],
                ),
                name=f"{role}-commission-{action}",
            )
            for action in actions
        ],
    ]


urlpatterns += _routes("admin", AdminCommissionSerializer) + _routes("provider", CommissionSerializer)
