from io import BytesIO

import qrcode
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from credits.models import ProviderConsumptionCredential
from credits.services import sign_provider_qr
from providers.models import Benefit, Provider
from providers.views import private_file
from referrals.access import sign_qr
from referrals.models import CollaboratorProfile
from shop.models import Product

from .permissions import IsProgramAdmin


class AdminImageView(APIView):
    permission_classes = [IsProgramAdmin]
    models = {"providers": Provider, "benefits": Benefit, "products": Product}

    @extend_schema(responses={(200, "image/png"): OpenApiTypes.BINARY})
    def get(self, request, resource, pk):
        model = self.models.get(resource)
        if model is None:
            raise NotFound()
        try:
            return private_file(get_object_or_404(model, pk=pk).image)
        except OSError:
            raise NotFound("Imagen no disponible.") from None


def current_qr(resource, pk):
    if resource == "providers":
        get_object_or_404(Provider, pk=pk)
        credential = get_object_or_404(ProviderConsumptionCredential, provider_id=pk)
        if not credential.pin_hash:
            raise NotFound("Configurá el PIN antes de consultar el QR.")
        return f"{settings.PUBLIC_APP_URL}/consumo#token={sign_provider_qr(credential)}"
    if resource == "collaborators":
        profile = get_object_or_404(CollaboratorProfile, pk=pk)
        if not profile.enabled or not profile.user.is_active:
            raise NotFound("El colaborador no está habilitado.")
        return f"{settings.PUBLIC_APP_URL}/referencia#token={sign_qr(profile)}"
    raise NotFound()


class AdminQRView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(responses={200: None})
    def get(self, request, resource, pk):
        return Response({"url": current_qr(resource, pk)})


class AdminQRPNGView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(responses={(200, "image/png"): OpenApiTypes.BINARY})
    def get(self, request, resource, pk):
        stream = BytesIO()
        qrcode.make(current_qr(resource, pk)).save(stream, format="PNG")
        response = HttpResponse(stream.getvalue(), content_type="image/png")
        response["Content-Disposition"] = 'attachment; filename="qr.png"'
        response["Cache-Control"] = "no-store"
        return response
