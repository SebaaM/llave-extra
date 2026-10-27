from rest_framework import serializers


class ConsumptionRequestSerializer(serializers.Serializer):
    folder_id = serializers.UUIDField(required=False, allow_null=True)
    qr_token = serializers.CharField(max_length=1000, trim_whitespace=False)
    pin = serializers.RegexField(r"^[0-9]{6,12}$", write_only=True)


class PinSerializer(serializers.Serializer):
    pin = serializers.RegexField(r"^[0-9]{6,12}$", write_only=True)


class ConsumptionResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    provider_id = serializers.UUIDField()
    collaborator_id = serializers.UUIDField(allow_null=True)
    award = serializers.IntegerField()
    balance = serializers.IntegerField()
    state = serializers.CharField()
    created_at = serializers.DateTimeField()


class ConsumptionHistorySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField(help_text="Nombre actual del Prestador asociado al consumo")
    collaborator_id = serializers.UUIDField(allow_null=True)
    award = serializers.IntegerField()
    state = serializers.CharField()
    created_at = serializers.DateTimeField()


class WalletResponseSerializer(serializers.Serializer):
    balance = serializers.IntegerField()
    redemptions_frozen = serializers.BooleanField()


class ProgressResponseSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    target = serializers.IntegerField()
    completed = serializers.BooleanField()


class ProviderCredentialResponseSerializer(serializers.Serializer):
    configured = serializers.BooleanField()
    qr_url = serializers.CharField(required=False)
