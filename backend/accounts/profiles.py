import re
from collections.abc import Mapping

from django.db import transaction
from django.views.decorators.debug import sensitive_variables
from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .bank import masked_bank_details, replace_bank_details
from .models import User
from .serializers import StrictSerializer


@extend_schema_field(str)
class StringField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class ProfileWriteSerializer(StrictSerializer):
    first_name = StringField(max_length=150)
    last_name = StringField(max_length=150)


class ProfileReadSerializer(serializers.Serializer):
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    complete = serializers.SerializerMethodField()

    def get_complete(self, user) -> bool:
        return bool(user.first_name.strip() and user.last_name.strip())


def valid_check_digit(block, weights):
    total = sum(int(digit) * weight for digit, weight in zip(block[:-1], weights, strict=True))
    return int(block[-1]) == -total % 10


class BankDetailsWriteSerializer(StrictSerializer):
    cbu = StringField()
    alias = StringField(allow_blank=True, default="")

    @sensitive_variables()
    def to_internal_value(self, data):
        if isinstance(data, Mapping) and set(data) - {"cbu", "alias"}:
            # Los nombres de campos inesperados también son entrada no confiable.
            raise serializers.ValidationError("El formulario admite solo CBU y alias.")
        return super().to_internal_value(data)

    @sensitive_variables()
    def validate_cbu(self, value):
        if not re.fullmatch(r"[0-9]{22}", value):
            raise serializers.ValidationError("Ingresá los 22 dígitos del CBU.")
        if not valid_check_digit(value[:8], (7, 1, 3, 9, 7, 1, 3)) or not valid_check_digit(
            value[8:], (3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3),
        ):
            raise serializers.ValidationError("Revisá el CBU. Sus dígitos verificadores no coinciden.")
        return value

    @sensitive_variables()
    def validate_alias(self, value):
        if value and not re.fullmatch(r"[A-Za-z0-9.\-]{6,20}", value):
            raise serializers.ValidationError("Usá de 6 a 20 letras sin acentos, números, puntos o guiones.")
        return value


class BankDetailsReadSerializer(serializers.Serializer):
    configured = serializers.BooleanField()
    cbu_masked = serializers.CharField(allow_null=True)
    alias_masked = serializers.CharField(allow_null=True)


class OwnAccountView(APIView):
    permission_classes = [IsAuthenticated]
    allowed_roles = ()

    def require_role(self, user):
        if user is None or not user.is_active or user.role not in self.allowed_roles:
            raise PermissionDenied("Esta opción no está disponible para tu cuenta.")

    def locked_user(self, user_id):
        user = User.objects.select_for_update().filter(pk=user_id).first()
        self.require_role(user)
        return user

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.require_role(request.user)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response


class ProfileView(OwnAccountView):
    allowed_roles = (User.Role.TOURIST, User.Role.COLLABORATOR)

    @extend_schema(responses=ProfileReadSerializer)
    def get(self, request):
        return Response(ProfileReadSerializer(request.user).data)

    @extend_schema(request=ProfileWriteSerializer, responses=ProfileReadSerializer)
    def patch(self, request):
        serializer = ProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = self.locked_user(request.user.pk)
            user.first_name = serializer.validated_data["first_name"]
            user.last_name = serializer.validated_data["last_name"]
            user.save(update_fields=["first_name", "last_name"])
        return Response(ProfileReadSerializer(user).data)


class BankDetailsView(OwnAccountView):
    allowed_roles = (User.Role.COLLABORATOR,)

    @extend_schema(responses=BankDetailsReadSerializer)
    def get(self, request):
        return Response(masked_bank_details(request.user.pk))

    @extend_schema(request=BankDetailsWriteSerializer, responses=BankDetailsReadSerializer)
    @sensitive_variables()
    def put(self, request):
        if not request.user.email_verified:
            raise PermissionDenied("Verificá tu email antes de guardar los datos bancarios.")
        serializer = BankDetailsWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = self.locked_user(request.user.pk)
            if not user.email_verified:
                raise PermissionDenied("Verificá tu email antes de guardar los datos bancarios.")
            replace_bank_details(user.pk, **serializer.validated_data)
            result = masked_bank_details(user.pk)
        return Response(result)
