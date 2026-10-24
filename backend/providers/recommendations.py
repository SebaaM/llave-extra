"""Own collaborator selections; public catalog availability never gates these APIs."""

from django.db import transaction
from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from referrals.models import CollaboratorProfile
from referrals.views import current_profile, private

from .access import selected_benefits
from .catalog import catalog_benefits
from .catalog_views import CatalogPagination
from .models import Benefit, FolderBenefit
from .serializers import BenefitReadSerializer, ProviderReadSerializer
from .views import PRIVATE_IMAGE_RESPONSES, private_file


class SelectionProviderSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    category = serializers.CharField()
    demo = serializers.BooleanField()


class SelectionBenefitSerializer(serializers.ModelSerializer):
    provider = SelectionProviderSerializer(read_only=True)

    class Meta:
        model = Benefit
        fields = ("id", "title", "description", "conditions", "valid_from", "valid_until", "demo", "provider")


class RecommendedBenefitSerializer(BenefitReadSerializer):
    provider = ProviderReadSerializer(read_only=True)

    class Meta(BenefitReadSerializer.Meta):
        fields = (*BenefitReadSerializer.Meta.fields, "provider")


class RecommendationSerializer(serializers.Serializer):
    benefit_id = serializers.UUIDField()
    available = serializers.BooleanField()
    benefit = RecommendedBenefitSerializer(allow_null=True)


class RecommendationsSerializer(serializers.Serializer):
    recommendations = RecommendationSerializer(many=True)


class EmptySelectionSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or data:
            raise serializers.ValidationError({"non_field_errors": ["Se requiere un objeto vacío; la carpeta se determina desde la sesión"]})
        return {}


SelectionPageSerializer = inline_serializer("CollaboratorCatalogPage", fields={
    "count": serializers.IntegerField(), "next": serializers.URLField(allow_null=True),
    "previous": serializers.URLField(allow_null=True), "results": SelectionBenefitSerializer(many=True),
})


class PrivateCollaboratorView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def finalize_response(self, request, response, *args, **kwargs):
        return private(super().finalize_response(request, response, *args, **kwargs))


class CollaboratorCatalogView(PrivateCollaboratorView):
    @extend_schema(parameters=[
        OpenApiParameter("page", OpenApiTypes.INT),
        OpenApiParameter("page_size", OpenApiTypes.INT, description="24 por defecto; máximo 48"),
        OpenApiParameter("search", OpenApiTypes.STR), OpenApiParameter("category", OpenApiTypes.STR),
    ], responses=SelectionPageSerializer)
    def get(self, request):
        current_profile(request.user)
        benefits = catalog_benefits()
        search = request.query_params.get("search", "").strip()
        category = request.query_params.get("category", "").strip()
        if search:
            benefits = benefits.filter(Q(title__icontains=search) | Q(description__icontains=search) | Q(provider__name__icontains=search))
        if category:
            benefits = benefits.filter(provider__category__iexact=category)
        paginator = CatalogPagination()
        page = paginator.paginate_queryset(benefits.order_by("provider__name", "title", "pk"), request, view=self)
        return paginator.get_paginated_response(SelectionBenefitSerializer(page, many=True).data)


class CollaboratorRecommendationsView(PrivateCollaboratorView):
    @extend_schema(responses=RecommendationsSerializer)
    def get(self, request):
        profile = current_profile(request.user)
        eligible = {benefit.pk: benefit for benefit in selected_benefits(profile.pk)}
        rows = [{"benefit_id": selection.benefit_id, "available": selection.benefit_id in eligible,
                 "benefit": eligible.get(selection.benefit_id)}
                for selection in FolderBenefit.objects.filter(collaborator=profile).order_by("created_at", "pk")]
        return Response(RecommendationsSerializer({"recommendations": rows}, context={"collaborator": True}).data)


class CollaboratorRecommendationView(PrivateCollaboratorView):
    @extend_schema(request=EmptySelectionSerializer, responses={201: None, 200: None, 404: None})
    def put(self, request, benefit_id):
        serializer = EmptySelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            # All User locks precede the profile. Joined User rows must never be
            # locked implicitly after a profile (same order as referred E4).
            user = User.objects.select_for_update().get(pk=request.user.pk)
            profile = current_profile(user)
            CollaboratorProfile.objects.select_for_update(of=("self",)).get(pk=profile.pk)
            profile = current_profile(user)
            try:
                FolderBenefit.lock_target(profile.pk, benefit_id)
            except Benefit.DoesNotExist:
                raise NotFound() from None
            if not catalog_benefits().filter(pk=benefit_id).exists():
                raise NotFound()
            _, created = FolderBenefit.assign(profile.pk, benefit_id)
        return Response(status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(responses={204: None})
    def delete(self, request, benefit_id):
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            profile = current_profile(user)
            CollaboratorProfile.objects.select_for_update(of=("self",)).get(pk=profile.pk)
            profile = current_profile(user)
            if FolderBenefit.objects.filter(collaborator=profile, benefit_id=benefit_id).exists():
                FolderBenefit.remove(profile.pk, benefit_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CollaboratorRecommendationMediaView(PrivateCollaboratorView):
    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, benefit_id):
        profile = current_profile(request.user)
        benefit = selected_benefits(profile.pk).filter(pk=benefit_id).first()
        if benefit is None:
            raise NotFound()
        return private_file(benefit.image)
