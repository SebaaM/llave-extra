from django.urls import reverse
from rest_framework import serializers

from .models import Benefit, Provider


class PublicProviderSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Provider
        fields = (
            "id", "slug", "name", "category", "description", "address", "hours", "contact",
            "map_url", "website", "demo", "image_url",
        )

    def get_image_url(self, obj) -> str | None:
        return reverse("catalog-provider-media", kwargs={"provider_id": obj.pk}) if obj.image else None


class PublicBenefitSerializer(serializers.ModelSerializer):
    provider = PublicProviderSerializer(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Benefit
        fields = (
            "id", "title", "description", "conditions", "valid_from", "valid_until",
            "demo", "image_url", "provider",
        )

    def get_image_url(self, obj) -> str | None:
        return reverse("catalog-benefit-media", kwargs={"benefit_id": obj.pk}) if obj.image else None
