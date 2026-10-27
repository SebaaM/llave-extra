from django.urls import reverse
from rest_framework import serializers

from .models import CancellationRequest, Order, OrderLine, Product


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) - set(self.fields):
            raise serializers.ValidationError({"non_field_errors": ["Campos no permitidos"]})
        return super().to_internal_value(data)


class CartLineSerializer(StrictSerializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=99)

    def to_internal_value(self, data):
        if isinstance(data, dict) and type(data.get("quantity")) is not int:
            raise serializers.ValidationError({"quantity": ["quantity debe ser un entero JSON"]})
        return super().to_internal_value(data)


class CheckoutSerializer(StrictSerializer):
    mode = serializers.ChoiceField(choices=Order.Mode.choices)
    items = CartLineSerializer(many=True, allow_empty=False, max_length=20)


class CancellationInputSerializer(StrictSerializer):
    reason = serializers.CharField(max_length=500)


class ProductSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "name", "description", "stock", "price_money", "price_credits", "image_url")

    def get_image_url(self, obj) -> str | None:
        return reverse("shop-product-media", kwargs={"pk": obj.pk}) if obj.image else None


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLine
        fields = ("product_id", "name", "quantity", "unit_money", "unit_credits")


class CancellationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CancellationRequest
        fields = ("id", "reason", "state", "created_at", "resolved_at", "resolution_reason")


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    cancellations = CancellationSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "mode", "state", "currency", "total_money", "total_credits", "pickup_snapshot",
                  "created_at", "reserved_until", "checkout_url", "lines", "cancellations")
