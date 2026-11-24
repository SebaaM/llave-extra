from io import BytesIO

import qrcode
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import permissions
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.views import APIView

from accounts.models import User
from accounts.security import rate_limit
from accounts.views import client_origin, private_response
from providers.access import locked_owned_provider, owned_provider, selected_benefits
from referrals.access import active_folder_access
from referrals.models import CollaboratorProfile
from referrals.views import private

from .models import Consumption, CreditPolicy, ProviderConsumptionCredential, Wallet
from .serializers import (
    ConsumptionHistorySerializer,
    ConsumptionOptionsRequestSerializer,
    ConsumptionOptionsResponseSerializer,
    ConsumptionRequestSerializer,
    ConsumptionResponseSerializer,
    PinSerializer,
    ProgressResponseSerializer,
    ProviderCredentialResponseSerializer,
    ReferredConsumptionRequestSerializer,
    WalletResponseSerializer,
)
from .services import award_consumption, parse_provider_qr, set_provider_pin, sign_provider_qr


def customer(user):
    if not user.is_active or user.role != User.Role.TOURIST:
        raise PermissionDenied("Solo clientes activos")


class ConsumptionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=ConsumptionRequestSerializer, responses={
        201: ConsumptionResponseSerializer,
        400: OpenApiResponse(description="QR, PIN o datos inválidos"),
        401: OpenApiResponse(description="Sesión requerida"),
        403: OpenApiResponse(description="Cliente, email o carpeta no habilitados"),
        409: OpenApiResponse(description="Clave reutilizada o consumo ya registrado"),
        429: OpenApiResponse(description="Control de intentos excedido o no disponible"),
    },
                   parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)])
    def post(self, request):
        return self._post(request, ConsumptionRequestSerializer)

    def _post(self, request, serializer_class):
        customer(request.user)
        key = request.headers.get("Idempotency-Key", "")
        if not 1 <= len(key) <= 128 or any(ord(ch) < 33 or ord(ch) > 126 for ch in key):
            raise ValidationError({"Idempotency-Key": "Clave obligatoria de 1 a 128 caracteres visibles"})
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result, code = award_consumption(request.user, data.get("folder_id"), data["qr_token"],
                                         data["pin"], key, origin=client_origin(request),
                                         benefit_id=data.get("benefit_id"))
        return private_response(result, code)


class ReferredConsumptionView(ConsumptionView):
    @extend_schema(
        operation_id="referred_consumption_create",
        request=ReferredConsumptionRequestSerializer,
        responses={201: ConsumptionResponseSerializer, 400: OpenApiResponse(description="Datos o beneficio inválidos"),
                   403: OpenApiResponse(description="Cliente, email o carpeta no habilitados"),
                   409: OpenApiResponse(description="Clave reutilizada o consumo ya registrado")},
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)],
    )
    def post(self, request):
        return self._post(request, ReferredConsumptionRequestSerializer)


class ConsumptionOptionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=ConsumptionOptionsRequestSerializer, responses={200: ConsumptionOptionsResponseSerializer})
    def post(self, request):
        customer(request.user)
        rate_limit("consumption_options", f"origin:{client_origin(request)}")
        rate_limit("consumption_options", f"account:{request.user.pk}")
        serializer = ConsumptionOptionsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        provider_id, version = parse_provider_qr(data["qr_token"])
        profile = CollaboratorProfile.objects.filter(pk=data["folder_id"]).first()
        if profile is None or not active_folder_access(request.user, profile):
            raise PermissionDenied("Acceso a carpeta no autorizado")
        if not ProviderConsumptionCredential.objects.filter(provider_id=provider_id, qr_version=version).exclude(pin_hash="").exists():
            raise ValidationError({"qr_token": "QR de prestador inválido"})
        benefits = list(selected_benefits(profile.pk).filter(provider_id=provider_id).order_by("title", "pk")
                        .values("id", "title"))
        if not benefits:
            raise PermissionDenied("Prestador no habilitado para la carpeta")
        return private_response({"benefits": benefits})


class WalletView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: WalletResponseSerializer})
    def get(self, request):
        customer(request.user)
        wallet = Wallet.objects.filter(tourist=request.user).first()
        return private_response({"balance": wallet.balance if wallet else 0,
                                 "redemptions_frozen": wallet.redemptions_frozen if wallet else False})


class MyConsumptionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ConsumptionHistorySerializer(many=True)})
    def get(self, request):
        customer(request.user)
        items = Consumption.objects.filter(tourist=request.user).select_related("provider").order_by("-created_at")
        return private_response([{"id": str(item.pk), "provider_id": str(item.provider_id),
                                  "provider_name": item.provider.name,
                                  "collaborator_id": str(item.collaborator_id) if item.collaborator_id else None,
                                  "award": item.award,
                                  "state": item.state, "created_at": item.created_at}
                                 for item in items])


class ProgressView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ProgressResponseSerializer})
    def get(self, request):
        customer(request.user)
        policy, _ = CreditPolicy.objects.get_or_create(singleton=1)
        total = Consumption.objects.filter(tourist=request.user, state=Consumption.State.VALID).count()
        return private_response({"total": total, "target": policy.target_visits,
                                 "completed": total >= policy.target_visits})


class ProviderCredentialView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ProviderCredentialResponseSerializer})
    def get(self, request, provider_id):
        owned_provider(request.user, provider_id)
        credential = ProviderConsumptionCredential.objects.filter(provider_id=provider_id).first()
        if credential is None or not credential.pin_hash:
            return private_response({"configured": False})
        token = sign_provider_qr(credential)
        return private_response({"configured": True, "qr_url": f"{settings.PUBLIC_APP_URL}/consumo#token={token}"})

    @extend_schema(
        request=PinSerializer,
        responses={
            200: ProviderCredentialResponseSerializer,
            403: OpenApiResponse(description="Se requiere un Prestador activo"),
            404: OpenApiResponse(description="El negocio no pertenece al Prestador"),
        },
    )
    def put(self, request, provider_id):
        with transaction.atomic():
            locked_owned_provider(request.user, provider_id)
            serializer = PinSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            set_provider_pin(provider_id, serializer.validated_data["pin"])
        return private_response({"configured": True})


class ProviderCredentialPNGView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={(200, "image/png"): OpenApiTypes.BINARY, 404: OpenApiResponse(description="Credencial no configurada")})
    def get(self, request, provider_id):
        owned_provider(request.user, provider_id)
        credential = ProviderConsumptionCredential.objects.filter(provider_id=provider_id).first()
        if credential is None or not credential.pin_hash:
            raise NotFound("Credencial no configurada")
        out = BytesIO()
        qrcode.make(f"{settings.PUBLIC_APP_URL}/consumo#token={sign_provider_qr(credential)}").save(out, format="PNG")
        response = HttpResponse(out.getvalue(), content_type="image/png")
        response["Content-Disposition"] = 'attachment; filename="consumo.png"'
        response["X-Content-Type-Options"] = "nosniff"
        return private(response)
