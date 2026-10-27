from rest_framework import serializers

from accounts.models import User
from credits.models import AdjustmentCase, Consumption, ProviderCreditRule, Wallet, WalletEntry
from providers.models import Benefit, Provider
from referrals.models import CollaboratorProfile
from shop.models import (
    CancellationRequest,
    Order,
    OrderAudit,
    OrderLine,
    PaymentOperation,
    Product,
    StockAdjustment,
)

from .resource_versions import admin_resource_version
from .serializers import StrictModelSerializer, StrictSerializer


class VersionedReadSerializer(serializers.ModelSerializer):
    version = serializers.SerializerMethodField()

    def get_version(self, obj) -> str:
        return admin_resource_version(obj)


class UserReadSerializer(VersionedReadSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "role", "is_active", "email_verified", "version")


class UserCreateSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=("TOURIST", "PROVIDER", "COLLABORATOR"))


class UserPatchSerializer(StrictSerializer):
    version = serializers.CharField(required=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class UserPatchRequestSerializer(UserPatchSerializer):
    version = serializers.CharField(required=True, min_length=64, max_length=64)


class ProviderReadSerializer(VersionedReadSerializer):
    image_url = serializers.SerializerMethodField()
    user_ids = serializers.SerializerMethodField()

    class Meta:
        model = Provider
        ref_name = "AdminProviderRead"
        fields = ("id", "slug", "name", "category", "description", "address", "hours", "contact", "map_url",
                  "website", "image_url", "status", "demo", "provenance", "user_ids", "version")

    def get_image_url(self, obj) -> str | None:
        return f"/api/v1/admin/providers/{obj.pk}/image/" if obj.image else None

    def get_user_ids(self, obj) -> list[int]:
        return [membership.user_id for membership in obj.memberships.all()]


class ProviderWriteSerializer(StrictModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Provider
        ref_name = "AdminProviderWrite"
        fields = ("slug", "name", "category", "description", "address", "hours", "contact", "map_url",
                  "website", "image", "status")


class ProviderPatchRequestSerializer(ProviderWriteSerializer):
    version = serializers.CharField(required=True, min_length=64, max_length=64)

    class Meta(ProviderWriteSerializer.Meta):
        ref_name = "AdminProviderPatchRequest"
        fields = (*ProviderWriteSerializer.Meta.fields, "version")


class BenefitReadSerializer(VersionedReadSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Benefit
        ref_name = "AdminBenefitRead"
        fields = ("id", "provider", "provider_name", "title", "description", "conditions", "valid_from",
                  "valid_until", "image_url", "status", "demo", "provenance", "version")

    def get_image_url(self, obj) -> str | None:
        return f"/api/v1/admin/benefits/{obj.pk}/image/" if obj.image else None


class BenefitWriteSerializer(StrictModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Benefit
        ref_name = "AdminBenefitWrite"
        fields = ("provider", "title", "description", "conditions", "valid_from", "valid_until", "image",
                  "status")

    def validate(self, attrs):
        def current(name, default=None):
            return attrs.get(name, getattr(self.instance, name, default))

        errors = {}
        start, end = current("valid_from"), current("valid_until")
        if start and end and start > end:
            errors["valid_from"] = ["La fecha inicial no puede ser posterior a la fecha final."]
            errors["valid_until"] = ["La fecha final no puede ser anterior a la fecha inicial."]
        if current("status") == "PUBLISHED" and not current("conditions", "").strip():
            errors["conditions"] = ["Completá las condiciones antes de publicar el beneficio."]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class BenefitPatchRequestSerializer(BenefitWriteSerializer):
    version = serializers.CharField(required=True, min_length=64, max_length=64)

    class Meta(BenefitWriteSerializer.Meta):
        ref_name = "AdminBenefitPatchRequest"
        fields = (*BenefitWriteSerializer.Meta.fields, "version")


class CollaboratorReadSerializer(VersionedReadSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    benefit_ids = serializers.SerializerMethodField()

    class Meta:
        model = CollaboratorProfile
        fields = ("id", "user", "user_email", "enabled", "network_title", "network_layout", "network_theme",
                  "network_background", "network_page_size", "network_interval_seconds", "benefit_ids", "version")

    def get_benefit_ids(self, obj) -> list[str]:
        return [str(row.benefit_id) for row in obj.folder_benefits.all()]


class CollaboratorWriteSerializer(StrictModelSerializer):
    network_page_size = serializers.IntegerField(min_value=10, max_value=15, required=False)
    network_interval_seconds = serializers.IntegerField(min_value=8, max_value=60, required=False)

    class Meta:
        model = CollaboratorProfile
        fields = ("user", "network_title", "network_layout", "network_theme", "network_background",
                  "network_page_size", "network_interval_seconds")


class CollaboratorPatchRequestSerializer(CollaboratorWriteSerializer):
    version = serializers.CharField(required=True, min_length=64, max_length=64)

    class Meta(CollaboratorWriteSerializer.Meta):
        fields = (*CollaboratorWriteSerializer.Meta.fields, "version")


class ConsumptionReadSerializer(serializers.ModelSerializer):
    state = serializers.CharField(read_only=True)
    tourist_email = serializers.EmailField(source="tourist.email", read_only=True)
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    collaborator_email = serializers.SerializerMethodField()

    class Meta:
        model = Consumption
        fields = ("id", "tourist", "tourist_email", "provider", "provider_name", "collaborator",
                  "collaborator_email", "award", "rule_snapshot", "state", "created_at", "annulled_at", "annul_reason")

    def get_collaborator_email(self, obj) -> str | None:
        return obj.collaborator.user.email if obj.collaborator_id else None


class WalletEntryReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletEntry
        fields = ("id", "kind", "delta", "reference", "source_entry", "created_at")


class WalletReadSerializer(serializers.ModelSerializer):
    tourist_email = serializers.EmailField(source="tourist.email", read_only=True)

    class Meta:
        model = Wallet
        fields = ("id", "tourist", "tourist_email", "balance", "redemptions_frozen")


class WalletMovementPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = WalletEntryReadSerializer(many=True)


class WalletDetailSerializer(WalletReadSerializer):
    movements = WalletMovementPageSerializer(read_only=True)

    class Meta(WalletReadSerializer.Meta):
        fields = (*WalletReadSerializer.Meta.fields, "movements")


class AdjustmentReadSerializer(serializers.ModelSerializer):
    tourist_email = serializers.EmailField(source="consumption.tourist.email", read_only=True)

    class Meta:
        model = AdjustmentCase
        fields = ("id", "consumption", "tourist_email", "shortfall", "funded_amount", "forgiven_amount",
                  "created_at", "resolved_at", "resolved_by", "resolution", "resolution_reason")


class ProductReadSerializer(VersionedReadSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "name", "description", "image_url", "active", "stock", "price_money",
                  "price_credits", "demo", "version")

    def get_image_url(self, obj) -> str | None:
        return f"/api/v1/admin/products/{obj.pk}/image/" if obj.image else None


class ProductWriteSerializer(StrictModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Product
        fields = ("name", "description", "image", "active", "price_money", "price_credits")


class ProductPatchRequestSerializer(ProductWriteSerializer):
    version = serializers.CharField(required=True, min_length=64, max_length=64)

    class Meta(ProductWriteSerializer.Meta):
        fields = (*ProductWriteSerializer.Meta.fields, "version")


class OrderLineReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = ("product", "name", "quantity", "unit_money", "unit_credits")


class OrderAuditReadSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, allow_null=True)

    class Meta:
        model = OrderAudit
        fields = ("id", "actor_email", "action", "reason", "created_at")


class CancellationReadSerializer(serializers.ModelSerializer):
    state = serializers.CharField(read_only=True)
    customer_email = serializers.EmailField(source="order.customer.email", read_only=True)

    class Meta:
        model = CancellationRequest
        fields = ("id", "order", "customer_email", "reason", "state", "created_at", "resolved_at",
                  "resolved_by", "resolution_reason")


class PaymentOperationReadSerializer(serializers.ModelSerializer):
    state = serializers.CharField(read_only=True)
    class Meta:
        model = PaymentOperation
        fields = ("id", "order", "kind", "state", "attempts", "available_at", "lease_until",
                  "generation", "last_code", "created_at")


class OrderSummarySerializer(serializers.ModelSerializer):
    state = serializers.CharField(read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True)

    class Meta:
        model = Order
        fields = ("id", "customer", "customer_email", "mode", "state", "currency", "total_money",
                  "total_credits", "created_at")


class OrderReadSerializer(serializers.ModelSerializer):
    state = serializers.CharField(read_only=True)
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    lines = OrderLineReadSerializer(many=True, read_only=True)
    cancellations = CancellationReadSerializer(many=True, read_only=True)
    payment_operations = PaymentOperationReadSerializer(many=True, read_only=True)
    audit = OrderAuditReadSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "customer", "customer_email", "mode", "state", "currency", "total_money",
                  "total_credits", "pickup_snapshot", "created_at", "reserved_until", "stock_released",
                  "payment_provider", "payment_confirmed", "lines", "cancellations", "payment_operations", "audit")


class StockAdjustmentReadSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = StockAdjustment
        fields = ("id", "product", "product_name", "actor_email", "delta", "resulting_stock", "reason", "created_at")


class CreditRuleReadSerializer(VersionedReadSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)

    class Meta:
        model = ProviderCreditRule
        fields = ("id", "provider", "provider_name", "reward", "version")


class CreditRuleWriteSerializer(StrictModelSerializer):
    class Meta:
        model = ProviderCreditRule
        fields = ("provider", "reward")


class CreditRulePatchRequestSerializer(CreditRuleWriteSerializer):
    version = serializers.CharField(required=True, min_length=64, max_length=64)

    class Meta(CreditRuleWriteSerializer.Meta):
        fields = (*CreditRuleWriteSerializer.Meta.fields, "version")
