from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from .media import validate_private_image
from .models import Benefit, Provider, Publication


class ImageURLMixin:
    def image_url(self, obj, *, folder_id=None):
        if not obj.image:
            return None
        if isinstance(obj, Provider):
            if self.context.get("collaborator"):
                name, kwargs = "collaborator-provider-media", {"provider_id": obj.pk}
            else:
                name = "folder-provider-media" if folder_id else "owned-provider-media"
                kwargs = {"folder_id": folder_id, "provider_id": obj.pk} if folder_id else {"provider_id": obj.pk}
        else:
            name = "folder-benefit-media" if folder_id else "owned-benefit-media"
            kwargs = {"folder_id": folder_id, "provider_id": obj.provider_id, "benefit_id": obj.pk} if folder_id else {"provider_id": obj.provider_id, "benefit_id": obj.pk}
        return reverse(name, kwargs=kwargs)


class ProviderReadSerializer(ImageURLMixin, serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Provider
        fields = ("id", "slug", "name", "category", "description", "address", "hours", "contact", "map_url", "website", "image_url", "status", "demo")

    def get_image_url(self, obj) -> str | None:
        return self.image_url(obj, folder_id=self.context.get("folder_id"))


class CollaboratorFolderReadSerializer(serializers.Serializer):
    collaborator_id = serializers.UUIDField()
    referral_url = serializers.URLField()
    providers = ProviderReadSerializer(many=True)


class ProviderWriteSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True, validators=[validate_private_image])

    class Meta:
        model = Provider
        fields = ("description", "address", "hours", "contact", "map_url", "website", "image")

    def validate(self, attrs):
        unexpected = set(self.initial_data) - set(self.fields)
        if unexpected:
            raise serializers.ValidationError({field: "Campo no editable" for field in unexpected})
        return attrs

    def update(self, instance, validated_data):
        with transaction.atomic():
            current = Provider.objects.select_for_update().get(pk=instance.pk)
            for field, value in validated_data.items():
                setattr(current, field, value)
            if validated_data:
                current.full_clean()
                current.save(update_fields=list(validated_data))
            return current


class BenefitReadSerializer(ImageURLMixin, serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Benefit
        fields = ("id", "title", "description", "conditions", "valid_from", "valid_until", "image_url", "status", "demo")

    def get_image_url(self, obj) -> str | None:
        return self.image_url(obj, folder_id=self.context.get("folder_id"))


class BenefitWriteSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True, validators=[validate_private_image])

    class Meta:
        model = Benefit
        fields = ("title", "description", "conditions", "valid_from", "valid_until", "image")

    def validate(self, attrs):
        unexpected = set(self.initial_data) - set(self.fields)
        if unexpected:
            raise serializers.ValidationError({field: "Campo no editable" for field in unexpected})
        start = attrs.get("valid_from", getattr(self.instance, "valid_from", None))
        end = attrs.get("valid_until", getattr(self.instance, "valid_until", None))
        if start and end and start > end:
            raise serializers.ValidationError("La vigencia tiene fechas invertidas")
        return attrs

    def update(self, instance, validated_data):
        with transaction.atomic():
            current = Benefit.objects.select_for_update().get(pk=instance.pk)
            changed = any(getattr(current, key) != value for key, value in validated_data.items())
            for field, value in validated_data.items():
                setattr(current, field, value)
            update_fields = list(validated_data)
            if changed and current.status == Publication.PUBLISHED:
                current.status = Publication.DRAFT
                update_fields.append("status")
            if update_fields:
                current.full_clean()
                current.save(update_fields=update_fields)
            return current
