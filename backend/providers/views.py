from django.http import FileResponse, Http404, HttpResponse, HttpResponseForbidden
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from referrals.access import active_folder_access
from referrals.models import CollaboratorProfile
from referrals.views import current_profile, qr_url

from .access import owned_provider, visible_benefits, visible_provider
from .models import Benefit, Provider, Publication
from .serializers import (
    BenefitReadSerializer,
    BenefitWriteSerializer,
    CollaboratorFolderReadSerializer,
    ProviderReadSerializer,
    ProviderWriteSerializer,
)

PRIVATE_IMAGE_RESPONSES = {
    (200, "image/png"): OpenApiTypes.BINARY,
    (200, "image/jpeg"): OpenApiTypes.BINARY,
    (200, "image/webp"): OpenApiTypes.BINARY,
}


def private_file(field):
    if not field:
        raise Http404
    response = FileResponse(field.open("rb"), content_type={".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(field.name[field.name.rfind("."):], "application/octet-stream"))
    response["Cache-Control"] = "private, no-store"
    response["Referrer-Policy"] = "no-referrer"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def folder_profile(request, folder_id):
    profile = CollaboratorProfile.objects.filter(pk=folder_id).first()
    if profile is None or not active_folder_access(request.user, profile):
        raise NotFound()
    return profile


class FolderProvidersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ProviderReadSerializer(many=True)})
    def get(self, request, folder_id):
        folder_profile(request, folder_id)
        providers = Provider.objects.filter(status=Publication.PUBLISHED, folder_assignments__collaborator_id=folder_id).order_by("name")
        return Response(ProviderReadSerializer(providers, many=True, context={"folder_id": folder_id}).data)


class FolderProviderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ProviderReadSerializer})
    def get(self, request, folder_id, provider_id):
        provider = visible_provider(request.user, folder_id, provider_id)
        return Response(ProviderReadSerializer(provider, context={"folder_id": folder_id}).data)


class FolderBenefitsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: BenefitReadSerializer(many=True)})
    def get(self, request, folder_id, provider_id):
        provider = visible_provider(request.user, folder_id, provider_id)
        return Response(BenefitReadSerializer(visible_benefits(provider), many=True, context={"folder_id": folder_id}).data)


class FolderBenefitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: BenefitReadSerializer})
    def get(self, request, folder_id, provider_id, benefit_id):
        provider = visible_provider(request.user, folder_id, provider_id)
        benefit = visible_benefits(provider).filter(pk=benefit_id).first()
        if benefit is None:
            raise NotFound()
        return Response(BenefitReadSerializer(benefit, context={"folder_id": folder_id}).data)


class FolderProviderMediaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, folder_id, provider_id):
        return private_file(visible_provider(request.user, folder_id, provider_id).image)


class FolderBenefitMediaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, folder_id, provider_id, benefit_id):
        provider = visible_provider(request.user, folder_id, provider_id)
        benefit = visible_benefits(provider).filter(pk=benefit_id).first()
        if benefit is None:
            raise NotFound()
        return private_file(benefit.image)


class OwnProvidersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ProviderReadSerializer(many=True)})
    def get(self, request):
        if not request.user.is_active or request.user.role != User.Role.PROVIDER:
            raise PermissionDenied("Solo prestadores activos")
        providers = Provider.objects.filter(memberships__user=request.user).order_by("name")
        return Response(ProviderReadSerializer(providers, many=True).data)


class OwnProviderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ProviderReadSerializer})
    def get(self, request, provider_id):
        return Response(ProviderReadSerializer(owned_provider(request.user, provider_id)).data)

    @extend_schema(request=ProviderWriteSerializer, responses={200: ProviderReadSerializer})
    def patch(self, request, provider_id):
        provider = owned_provider(request.user, provider_id)
        serializer = ProviderWriteSerializer(provider, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        provider = serializer.save()
        return Response(ProviderReadSerializer(provider).data)


class OwnProviderMediaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, provider_id):
        return private_file(owned_provider(request.user, provider_id).image)


class OwnBenefitsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: BenefitReadSerializer(many=True)})
    def get(self, request, provider_id):
        provider = owned_provider(request.user, provider_id)
        return Response(BenefitReadSerializer(provider.benefits.order_by("title"), many=True).data)

    @extend_schema(request=BenefitWriteSerializer, responses={201: BenefitReadSerializer})
    def post(self, request, provider_id):
        provider = owned_provider(request.user, provider_id)
        serializer = BenefitWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        benefit = serializer.save(provider=provider)
        return Response(BenefitReadSerializer(benefit).data, status=status.HTTP_201_CREATED)


def owned_benefit(user, provider_id, benefit_id):
    provider = owned_provider(user, provider_id)
    benefit = provider.benefits.filter(pk=benefit_id).first()
    if benefit is None:
        raise NotFound()
    return benefit


class OwnBenefitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: BenefitReadSerializer})
    def get(self, request, provider_id, benefit_id):
        return Response(BenefitReadSerializer(owned_benefit(request.user, provider_id, benefit_id)).data)

    @extend_schema(request=BenefitWriteSerializer, responses={200: BenefitReadSerializer})
    def patch(self, request, provider_id, benefit_id):
        benefit = owned_benefit(request.user, provider_id, benefit_id)
        serializer = BenefitWriteSerializer(benefit, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        benefit = serializer.save()
        return Response(BenefitReadSerializer(benefit).data)

    @extend_schema(responses={204: None})
    def delete(self, request, provider_id, benefit_id):
        benefit = owned_benefit(request.user, provider_id, benefit_id)
        if benefit.status == Publication.PUBLISHED:
            raise PermissionDenied("Solicitá revisión administrativa para retirar una oferta publicada")
        benefit.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OwnBenefitMediaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, provider_id, benefit_id):
        return private_file(owned_benefit(request.user, provider_id, benefit_id).image)


class CollaboratorFolderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: CollaboratorFolderReadSerializer})
    def get(self, request):
        profile = current_profile(request.user)
        providers = Provider.objects.filter(status=Publication.PUBLISHED, folder_assignments__collaborator=profile).order_by("name")
        return Response({"collaborator_id": str(profile.pk), "referral_url": qr_url(profile),
                         "providers": ProviderReadSerializer(providers, many=True, context={"collaborator": True}).data})


class CollaboratorProviderMediaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, provider_id):
        profile = current_profile(request.user)
        provider = Provider.objects.filter(pk=provider_id, status=Publication.PUBLISHED,
                                           folder_assignments__collaborator=profile).first()
        if provider is None:
            raise NotFound()
        return private_file(provider.image)


def admin_private_media(request, name):
    if not request.user.is_authenticated:
        return HttpResponse(status=401)
    if not request.user.is_active or not request.user.is_staff or not request.user.is_superuser or request.user.role != User.Role.ADMIN:
        return HttpResponseForbidden()
    provider = Provider.objects.filter(image=name).first()
    if provider:
        return private_file(provider.image)
    benefit = Benefit.objects.filter(image=name).first()
    if benefit:
        return private_file(benefit.image)
    raise Http404
