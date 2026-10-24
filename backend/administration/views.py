from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from credits.models import CreditPolicy
from providers.models import CatalogConfig
from shop.models import ShopSettings
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


class ActivityView(generics.ListAPIView):
    permission_classes = [IsProgramAdmin]
    serializer_class = AdminAuditSerializer
    pagination_class = AdminPagination

    @extend_schema(parameters=[OpenApiParameter(name, str) for name in ("search", "actor", "action", "resource")])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        queryset = AdminAudit.objects.select_related("actor").order_by("-created_at", "-pk")
        params = self.request.query_params
        for name in ("actor", "action", "resource"):
            if value := params.get(name):
                if name == "actor":
                    try:
                        if int(value) < 1:
                            raise ValueError
                    except ValueError:
                        raise ValidationError({"actor": "Identificador inválido."}) from None
                queryset = queryset.filter(**{name: value})
        if search := params.get("search"):
            queryset = queryset.filter(Q(actor__email__icontains=search) | Q(action__icontains=search)
                                       | Q(resource__icontains=search) | Q(reason__icontains=search))
        return queryset
