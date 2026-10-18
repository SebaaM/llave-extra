from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({key: "Campo no permitido" for key in unknown})
        return super().to_internal_value(data)


class RegisterSerializer(StrictSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    referral_token = serializers.CharField(required=False, write_only=True, max_length=512)

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        candidate = get_user_model()(email=attrs["email"].strip().lower())
        validate_password(attrs["password"], candidate)
        return attrs


class LoginSerializer(StrictSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class EmailSerializer(StrictSerializer):
    email = serializers.EmailField()


class TokenSerializer(StrictSerializer):
    token = serializers.CharField(max_length=512)


class ResetSerializer(TokenSerializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value
