from rest_framework import serializers


def collaborator_name(profile):
    return profile.user.get_full_name().strip() or "tu guía local"


class RedeemResponseSerializer(serializers.Serializer):
    collaborator_id = serializers.UUIDField()
    collaborator_name = serializers.CharField()
    granted_at = serializers.DateTimeField()


class CollaboratorSelectionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class CollaboratorQRSerializer(serializers.Serializer):
    url = serializers.URLField()
    version = serializers.RegexField(r"\A[0-9a-f]{64}\Z")


class QRRenewalSerializer(serializers.Serializer):
    version = serializers.RegexField(r"\A[0-9a-f]{64}\Z", trim_whitespace=False)

    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) != {"version"}:
            raise serializers.ValidationError({"non_field_errors": ["Se requiere únicamente la versión vigente de la referencia."]})
        if not isinstance(data["version"], str):
            raise serializers.ValidationError({"version": ["Ingresá la versión vigente de la referencia."]})
        return super().to_internal_value(data)


class QRRenewalResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.RegexField(r"^renewed$", read_only=True, help_text="Resultado fijo: renewed.")
    version = serializers.RegexField(r"\A[0-9a-f]{64}\Z")
