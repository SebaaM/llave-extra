from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import CharField, F, JSONField, Q, Value
from django.db.models.functions import Cast
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import permissions, serializers
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from credits.models import CreditPolicy
from providers.models import CatalogConfig
from shop.models import OrderAudit, ShopSettings
from shop.services import require_admin

from .commands import record_audit
from .concurrency import require_version
from .models import AdminAudit, SiteSettings
from .permissions import IsProgramAdmin
from .serializers import (
    AdminAuditSerializer,
    CatalogSettingsSerializer,
    CreditSettingsSerializer,
    GeneralSettingsSerializer,
    PublicSiteSettingsSerializer,
    ShopSettingsSerializer,
)


class PublicSiteSettingsView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(responses=PublicSiteSettingsSerializer)
    def get(self, request):
        return Response(PublicSiteSettingsSerializer(SiteSettings.objects.filter(pk=1).first() or SiteSettings()).data)


def validate_model(instance):
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        # Do not echo model values, constraint SQL or validators' private context.
        fields = list(exc.message_dict) if hasattr(exc, "message_dict") else ["non_field_errors"]
        raise ValidationError({name: ["Valor inválido o conflicto de configuración."] for name in fields}) from None


class SettingsView(APIView):
    permission_classes = [IsProgramAdmin]
    model = None
    serializer_class = None
    group = ""

    def get(self, request):
        obj = self.model.objects.filter(pk=1).first() or self.model()
        return Response(self.serializer_class(obj).data)

    def patch(self, request):
        if not hasattr(request.data, "get"):
            raise ValidationError("Se requiere un objeto JSON.")
        with transaction.atomic():
            # Atomic creation plus unique singleton serializes concurrent first writes.
            # A stale/invalid first PATCH rolls creation back with the entire request.
            obj, _ = self.model.objects.get_or_create(singleton=1)
            obj = self.model.objects.select_for_update().get(pk=1)
            require_admin(request.user)
            require_version(obj, request.data.get("version"))
            serializer = self.serializer_class(obj, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            data = {name: value for name, value in serializer.validated_data.items() if name != "version"}
            changed = sorted(name for name, value in data.items() if getattr(obj, name) != value)
            for name, value in data.items():
                setattr(obj, name, value)
            validate_model(obj)
            if changed:
                obj.save(update_fields=changed)
                record_audit(request.user, "settings.update", "settings." + self.group, "1", changed)
            return Response(self.serializer_class(obj).data)


class GeneralSettingsView(SettingsView):
    model, serializer_class, group = SiteSettings, GeneralSettingsSerializer, "general"


class CatalogSettingsView(SettingsView):
    model, serializer_class, group = CatalogConfig, CatalogSettingsSerializer, "catalog"


class CreditSettingsView(SettingsView):
    model, serializer_class, group = CreditPolicy, CreditSettingsSerializer, "credits"


class ShopSettingsView(SettingsView):
    model, serializer_class, group = ShopSettings, ShopSettingsSerializer, "shop"


class AdminPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class ActivityView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(parameters=[OpenApiParameter(name, str) for name in ("search", "actor", "action", "resource")],
                   responses=inline_serializer("AdminActivityPage", fields={
                       "count": serializers.IntegerField(), "next": serializers.URLField(allow_null=True),
                       "previous": serializers.URLField(allow_null=True),
                       "results": AdminAuditSerializer(many=True),
                   }))
    def get(self, request):
        params = request.query_params
        admin_rows = AdminAudit.objects.all()
        order_rows = OrderAudit.objects.all()
        if value := params.get("actor"):
            try:
                if int(value) < 1:
                    raise ValueError
            except ValueError:
                raise ValidationError({"actor": "Identificador inválido."}) from None
            admin_rows = admin_rows.filter(actor_id=value)
            order_rows = order_rows.filter(actor_id=value)
        if value := params.get("action"):
            admin_rows = admin_rows.filter(action=value)
            order_rows = order_rows.filter(action=value)
        if value := params.get("resource"):
            admin_rows = admin_rows.filter(resource=value)
            if value != "orders":
                order_rows = order_rows.none()
        if search := params.get("search"):
            admin_rows = admin_rows.filter(Q(actor__email__icontains=search) | Q(action__icontains=search)
                                           | Q(resource__icontains=search) | Q(reason__icontains=search))
            order_rows = order_rows.filter(Q(actor__email__icontains=search) | Q(action__icontains=search)
                                           | Q(reason__icontains=search))
        fields = ("id", "actor_email", "action", "resource", "object_id", "changed_fields", "reason", "created_at")
        admin_rows = admin_rows.annotate(actor_email=F("actor__email")).values(*fields)
        order_rows = order_rows.annotate(
            actor_email=F("actor__email"), resource=Value("orders", output_field=CharField()),
            object_id=Cast("order_id", output_field=CharField()),
            changed_fields=Value([], output_field=JSONField()),
        ).values(*fields)
        combined = admin_rows.union(order_rows, all=True).order_by("-created_at", "-id")
        paginator = AdminPagination()
        page = paginator.paginate_queryset(combined, request, view=self)
        return paginator.get_paginated_response(page)
