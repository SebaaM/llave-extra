from collections.abc import Mapping

from rest_framework import serializers

from credits.models import MAX_CREDITS, CreditPolicy
from providers.models import CatalogConfig
from shop.models import ShopSettings

from .concurrency import resource_version
from .models import AdminAudit, SiteSettings
from .validators import validate_plain_text


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, Mapping) or set(data) - set(self.fields) or any(
            field in data for field, definition in self.fields.items() if definition.read_only
        ):
            raise serializers.ValidationError({"non_field_errors": ["Campos no permitidos."]})
        return super().to_internal_value(data)


class StrictModelSerializer(StrictSerializer, serializers.ModelSerializer):
    pass


class PublicSiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = ("site_name", "home_title", "home_description", "footer_text", "contact_email", "whatsapp_url", "instagram_url")


class VersionedSettingsSerializer(StrictModelSerializer):
    version = serializers.CharField(required=False, max_length=64)

    def to_representation(self, instance):
        # version is a request precondition and a computed response field.
        instance.version = resource_version(instance)
        return super().to_representation(instance)


class GeneralSettingsSerializer(VersionedSettingsSerializer):
    class Meta(PublicSiteSettingsSerializer.Meta):
        fields = (*PublicSiteSettingsSerializer.Meta.fields, "version")


class CatalogSettingsSerializer(VersionedSettingsSerializer):
    network_title = serializers.CharField(max_length=100, validators=[validate_plain_text])
    network_page_size = serializers.IntegerField(min_value=10, max_value=15)
    network_interval_seconds = serializers.IntegerField(min_value=8, max_value=60)

    class Meta:
        model = CatalogConfig
        fields = ("enabled", "network_title", "network_layout", "network_theme", "network_background", "network_page_size", "network_interval_seconds", "version")


class CreditSettingsSerializer(VersionedSettingsSerializer):
    base_reward = serializers.IntegerField(min_value=0, max_value=MAX_CREDITS)
    target_visits = serializers.IntegerField(min_value=1, max_value=1000)

    class Meta:
        model = CreditPolicy
        fields = ("base_reward", "target_visits", "version")


class ShopSettingsSerializer(VersionedSettingsSerializer):
    payment_provider = serializers.CharField(read_only=True)
    pickup_name = serializers.CharField(max_length=160, allow_blank=True, validators=[validate_plain_text])
    pickup_address = serializers.CharField(max_length=300, allow_blank=True, validators=[validate_plain_text])
    pickup_hours = serializers.CharField(max_length=300, allow_blank=True, validators=[validate_plain_text])

    class Meta:
        model = ShopSettings
        fields = ("pickup_name", "pickup_address", "pickup_hours", "pickup_enabled", "payment_provider", "version")

    def to_representation(self, instance):
        from django.conf import settings
        instance.payment_provider = settings.SHOP_PAYMENT_PROVIDER
        return super().to_representation(instance)

    def validate(self, attrs):
        enabled = attrs.get("pickup_enabled", self.instance.pickup_enabled)
        if enabled and not all(attrs.get(name, getattr(self.instance, name)).strip()
                               for name in ("pickup_name", "pickup_address", "pickup_hours")):
            raise serializers.ValidationError({"pickup_enabled": "Completá punto, dirección y horarios para habilitar el retiro."})
        return attrs


class AdminAuditSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AdminAudit
        fields = ("id", "actor_email", "action", "resource", "object_id", "changed_fields", "reason", "created_at")
