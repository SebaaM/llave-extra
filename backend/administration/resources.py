from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import AuthSession, User
from credits.models import AdjustmentCase, Consumption, ProviderCreditRule, Wallet
from credits.services import Conflict
from providers.catalog import catalog_benefits
from providers.models import Benefit, Provider
from referrals.models import CollaboratorProfile
from shop.models import CancellationRequest, Order, PaymentOperation, Product, StockAdjustment
from shop.services import require_admin

from .commands import record_audit
from .concurrency import require_version
from .permissions import IsProgramAdmin
from .resource_serializers import (
    AdjustmentReadSerializer,
    BenefitReadSerializer,
    BenefitWriteSerializer,
    CancellationReadSerializer,
    CollaboratorReadSerializer,
    CollaboratorWriteSerializer,
    ConsumptionReadSerializer,
    CreditRuleReadSerializer,
    CreditRuleWriteSerializer,
    OrderReadSerializer,
    PaymentOperationReadSerializer,
    ProductReadSerializer,
    ProductWriteSerializer,
    ProviderReadSerializer,
    ProviderWriteSerializer,
    StockAdjustmentReadSerializer,
    UserCreateSerializer,
    UserPatchSerializer,
    UserReadSerializer,
    WalletDetailSerializer,
    WalletEntryReadSerializer,
    WalletReadSerializer,
)
from .views import AdminPagination, validate_model


class ResourceView(generics.GenericAPIView):
    permission_classes = [IsProgramAdmin]
    model = None
    read_serializer = None
    write_serializer = None
    create_allowed = False
    patch_allowed = False
    resource = ""
    joins = ()
    prefetched = ()
    filters = {}
    search_fields = ()
    id_filters = {"provider": serializers.UUIDField(), "tourist": serializers.IntegerField(min_value=1),
                  "collaborator": serializers.UUIDField(), "customer": serializers.IntegerField(min_value=1),
                  "product": serializers.UUIDField()}

    def get_serializer_class(self):
        return self.read_serializer

    def queryset(self):
        queryset = self.model.objects.all()
        if self.joins:
            queryset = queryset.select_related(*self.joins)
        if self.prefetched:
            queryset = queryset.prefetch_related(*self.prefetched)
        return queryset

    @extend_schema(parameters=[OpenApiParameter(name, str) for name in
                               ("page", "page_size", "search", "role", "is_active", "email_verified", "status",
                                "provider", "enabled", "state", "mode", "kind", "active", "product", "customer",
                                "tourist", "collaborator", "created_from", "created_to", "current",
                                "user_active", "stock", "resolved")])
    def get(self, request, pk=None):
        if pk is not None:
            obj = get_object_or_404(self.queryset(), pk=pk)
            data = self.read_serializer(obj).data
            if self.resource == "wallets":
                entries = obj.entries.order_by("-created_at", "-pk")
                paginator = AdminPagination()
                page = paginator.paginate_queryset(entries, request, view=self)
                data["movements"] = paginator.get_paginated_response(
                    WalletEntryReadSerializer(page, many=True).data).data
            return Response(data)
        queryset = self.queryset()
        for name, lookup in self.filters.items():
            value = request.query_params.get(name)
            if value is None or value == "":
                continue
            if name in ("is_active", "email_verified", "enabled", "active", "user_active"):
                if value not in ("true", "false"):
                    raise ValidationError({name: "Usá true o false."})
                value = value == "true"
            elif name in self.id_filters:
                try:
                    value = self.id_filters[name].run_validation(value)
                except ValidationError:
                    raise ValidationError({name: "Identificador inválido."}) from None
            elif len(value) > 100:
                raise ValidationError({name: "Filtro demasiado largo."})
            queryset = queryset.filter(**{lookup: value})
        if self.resource == "benefits" and request.query_params.get("current") is not None:
            if request.query_params["current"] != "true":
                raise ValidationError({"current": "Usá true."})
            queryset = queryset.filter(pk__in=catalog_benefits().values("pk"))
        if self.resource == "products" and request.query_params.get("stock") is not None:
            if request.query_params["stock"] != "0":
                raise ValidationError({"stock": "Solo se admite 0."})
            queryset = queryset.filter(stock=0)
        if self.resource == "adjustments" and request.query_params.get("resolved") is not None:
            if request.query_params["resolved"] not in ("true", "false"):
                raise ValidationError({"resolved": "Usá true o false."})
            queryset = queryset.filter(resolved_at__isnull=request.query_params["resolved"] == "false")
        if search := request.query_params.get("search", "").strip():
            if len(search) > 160:
                raise ValidationError({"search": "Búsqueda demasiado larga."})
            condition = Q()
            for field in self.search_fields:
                condition |= Q(**{f"{field}__icontains": search})
            queryset = queryset.filter(condition)
        for name, lookup in (("created_from", "created_at__date__gte"), ("created_to", "created_at__date__lte")):
            if value := request.query_params.get(name):
                if not hasattr(self.model, "created_at"):
                    raise ValidationError({name: "Filtro no disponible."})
                try:
                    parsed = serializers.DateField().run_validation(value)
                except ValidationError:
                    raise ValidationError({name: "Fecha inválida."}) from None
                queryset = queryset.filter(**{lookup: parsed})
        page = AdminPagination()
        items = page.paginate_queryset(queryset.order_by("-pk"), request, view=self)
        return page.get_paginated_response(self.read_serializer(items, many=True).data)

    def post(self, request, pk=None):
        if not self.create_allowed or pk is not None:
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
        serializer = self.write_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            require_admin(request.user)
            obj = self.create_object(serializer.validated_data)
            validate_model(obj)
            try:
                obj.save()
            except IntegrityError:
                raise Conflict("Registro duplicado o vinculación incompatible.") from None
            record_audit(request.user, f"{self.resource}.create", self.resource, obj.pk,
                         serializer.validated_data.keys())
        return Response(self.read_serializer(self.queryset().get(pk=obj.pk)).data, status=status.HTTP_201_CREATED)

    def create_object(self, data):
        return self.model(**data)

    def patch(self, request, pk=None):
        if not self.patch_allowed or pk is None:
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
        if not hasattr(request.data, "get"):
            raise ValidationError("Se requiere objeto.")
        # A missing/invalid precondition is a conflict, before any field is changed.
        with transaction.atomic():
            require_admin(request.user)
            obj = self.lock_for_patch(pk)
            require_version(obj, request.data.get("version"))
            payload = request.data.copy()
            payload.pop("version", None)
            serializer = self.write_serializer(obj, data=payload, partial=True)
            serializer.is_valid(raise_exception=True)
            data = self.patch_data(obj, serializer.validated_data)
            changed = sorted(name for name, value in data.items() if getattr(obj, name) != value)
            for name, value in data.items():
                setattr(obj, name, value)
            validate_model(obj)
            if changed:
                obj.save(update_fields=changed)
                self.after_patch(obj, changed)
                record_audit(request.user, f"{self.resource}.update", self.resource, obj.pk, changed)
        return Response(self.read_serializer(self.queryset().get(pk=obj.pk)).data)

    def lock_for_patch(self, pk):
        return get_object_or_404(self.model.objects.select_for_update(), pk=pk)

    def patch_data(self, obj, data):
        return data

    def after_patch(self, obj, changed):
        pass


class UsersView(ResourceView):
    model, read_serializer, write_serializer = User, UserReadSerializer, UserCreateSerializer
    resource, create_allowed, patch_allowed = "users", True, True
    filters = {"role": "role", "is_active": "is_active", "email_verified": "email_verified"}
    search_fields = ("email", "first_name", "last_name")

    def create_object(self, data):
        user = User(**data, is_staff=False, is_superuser=False, email_verified=False)
        user.set_unusable_password()
        return user

    def patch(self, request, pk=None):
        self.write_serializer = UserPatchSerializer
        return super().patch(request, pk)

    def patch_data(self, obj, data):
        if obj.role == User.Role.ADMIN:
            raise ValidationError("Las cuentas administradoras no se editan desde este panel.")
        if not data.get("is_active", True) and obj.pk == self.request.user.pk:
            raise ValidationError("No podés desactivar tu propia cuenta.")
        return data

    def after_patch(self, obj, changed):
        if "is_active" in changed and not obj.is_active:
            AuthSession.objects.filter(user=obj, revoked_at__isnull=True).update(revoked_at=timezone.now())

    def lock_for_patch(self, pk):
        return get_object_or_404(User.objects.select_for_update(), pk=pk)

    def get(self, request, pk=None):
        self.request = request
        return super().get(request, pk)

    def post(self, request, pk=None):
        self.request = request
        return super().post(request, pk)


class ProvidersView(ResourceView):
    model, read_serializer, write_serializer = Provider, ProviderReadSerializer, ProviderWriteSerializer
    resource, create_allowed, patch_allowed = "providers", True, True
    prefetched = ("memberships",)
    filters = {"status": "status"}
    search_fields = ("name", "slug", "category", "contact")


class BenefitsView(ResourceView):
    model, read_serializer, write_serializer = Benefit, BenefitReadSerializer, BenefitWriteSerializer
    resource, create_allowed, patch_allowed = "benefits", True, True
    joins = ("provider",)
    filters = {"status": "status", "provider": "provider_id"}
    search_fields = ("title", "description", "provider__name")

    def create_object(self, data):
        provider = Provider.objects.select_for_update().get(pk=data.pop("provider").pk)
        data.pop("demo", None)
        return Benefit(provider=provider, demo=provider.demo, **data)

    def patch_data(self, obj, data):
        if "provider" in data and data["provider"].pk != obj.provider_id:
            raise ValidationError({"provider": "No se puede cambiar el prestador del beneficio."})
        data.pop("provider", None)
        return data

    def lock_for_patch(self, pk):
        provider_id = get_object_or_404(Benefit.objects.only("provider_id"), pk=pk).provider_id
        Provider.objects.select_for_update().get(pk=provider_id)
        return get_object_or_404(Benefit.objects.select_for_update(), pk=pk, provider_id=provider_id)


class CollaboratorsView(ResourceView):
    model, read_serializer, write_serializer = CollaboratorProfile, CollaboratorReadSerializer, CollaboratorWriteSerializer
    resource, create_allowed, patch_allowed = "collaborators", True, True
    joins = ("user",)
    prefetched = ("folder_benefits",)
    filters = {"enabled": "enabled", "user_active": "user__is_active"}
    search_fields = ("user__email", "network_title")

    def create_object(self, data):
        if data["user"].role != User.Role.COLLABORATOR:
            raise ValidationError({"user": "El usuario debe ser Colaborador."})
        return super().create_object(data)

    def patch_data(self, obj, data):
        if "user" in data and data["user"].pk != obj.user_id:
            raise ValidationError({"user": "No se puede cambiar el titular."})
        data.pop("user", None)
        return data


class ConsumptionsView(ResourceView):
    model, read_serializer, resource = Consumption, ConsumptionReadSerializer, "consumptions"
    joins = ("tourist", "provider", "collaborator__user")
    filters = {"state": "state", "provider": "provider_id", "tourist": "tourist_id", "collaborator": "collaborator_id"}
    search_fields = ("tourist__email", "provider__name")


class WalletsView(ResourceView):
    model, read_serializer, resource = Wallet, WalletReadSerializer, "wallets"
    joins = ("tourist",)
    filters = {"tourist": "tourist_id"}
    search_fields = ("tourist__email",)


class AdjustmentsView(ResourceView):
    model, read_serializer, resource = AdjustmentCase, AdjustmentReadSerializer, "adjustments"
    joins = ("consumption__tourist",)
    filters = {"tourist": "consumption__tourist_id"}
    search_fields = ("consumption__tourist__email",)


class ProductsView(ResourceView):
    model, read_serializer, write_serializer = Product, ProductReadSerializer, ProductWriteSerializer
    resource, create_allowed, patch_allowed = "products", True, True
    filters = {"active": "active"}
    search_fields = ("name", "description")


class OrdersView(ResourceView):
    model, read_serializer, resource = Order, OrderReadSerializer, "orders"
    joins = ("customer",)
    prefetched = ("lines", "cancellations", "payment_operations", "audit__actor")
    filters = {"state": "state", "mode": "mode", "customer": "customer_id"}
    search_fields = ("customer__email",)


class CancellationsView(ResourceView):
    model, read_serializer, resource = CancellationRequest, CancellationReadSerializer, "cancellations"
    joins = ("order__customer",)
    filters = {"state": "state"}
    search_fields = ("order__customer__email",)


class PaymentOperationsView(ResourceView):
    model, read_serializer, resource = PaymentOperation, PaymentOperationReadSerializer, "payment-operations"
    filters = {"state": "state", "kind": "kind"}
    search_fields = ()


class StockAdjustmentsView(ResourceView):
    model, read_serializer, resource = StockAdjustment, StockAdjustmentReadSerializer, "stock-adjustments"
    joins = ("product", "actor")
    filters = {"product": "product_id"}
    search_fields = ("product__name", "reason")


class CreditRulesView(ResourceView):
    model, read_serializer, write_serializer = ProviderCreditRule, CreditRuleReadSerializer, CreditRuleWriteSerializer
    resource, create_allowed, patch_allowed = "credit-rules", True, True
    joins = ("provider",)
    filters = {"provider": "provider_id"}
    search_fields = ("provider__name",)

    def lock_for_patch(self, pk):
        provider_id = get_object_or_404(ProviderCreditRule.objects.only("provider_id"), pk=pk).provider_id
        Provider.objects.select_for_update().get(pk=provider_id)
        return get_object_or_404(ProviderCreditRule.objects.select_for_update(), pk=pk)

    def patch_data(self, obj, data):
        if "provider" in data and data["provider"].pk != obj.provider_id:
            raise ValidationError({"provider": "No se puede cambiar el prestador de la regla."})
        data.pop("provider", None)
        return data


def resource_endpoint(view_class, *, detail):
    """Expose a concrete resource contract for each collection/detail URL."""
    method_names = ["get", "head", "options"]
    name = view_class.resource.replace("-", "_")
    response = (WalletDetailSerializer if view_class is WalletsView else view_class.read_serializer) if detail else inline_serializer(
        f"Admin{name.title().replace('_', '')}Page",
        fields={"count": serializers.IntegerField(), "next": serializers.URLField(allow_null=True),
                "previous": serializers.URLField(allow_null=True),
                "results": view_class.read_serializer(many=True)},
    )

    @extend_schema(operation_id=f"admin_{name}_{'retrieve' if detail else 'list'}", responses=response)
    def get(self, request, pk=None):
        return view_class.get(self, request, pk)

    methods = {"get": get, "serializer_class": view_class.read_serializer, "http_method_names": method_names}
    if detail and view_class.patch_allowed:
        method_names.append("patch")
        request_serializer = UserPatchSerializer if view_class is UsersView else view_class.write_serializer

        @extend_schema(operation_id=f"admin_{name}_update", request=request_serializer,
                       responses=view_class.read_serializer)
        def patch(self, request, pk=None):
            return view_class.patch(self, request, pk)

        methods["patch"] = patch
    if not detail and view_class.create_allowed:
        method_names.append("post")

        @extend_schema(operation_id=f"admin_{name}_create", request=view_class.write_serializer,
                       responses={201: view_class.read_serializer})
        def post(self, request, pk=None):
            return view_class.post(self, request, pk)

        methods["post"] = post
    return type(f"{view_class.__name__}{'Detail' if detail else 'Collection'}", (view_class,), methods).as_view()
