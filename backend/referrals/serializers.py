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
