from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView

from referrals.access import active_folder_access
from referrals.serializers import CollaboratorSelectionSerializer, collaborator_name

from .access import selected_benefits
from .serializers import BenefitReadSerializer, ProviderReadSerializer
from .views import folder_profile


class FolderSelectedBenefitSerializer(BenefitReadSerializer):
    provider = ProviderReadSerializer()

    class Meta(BenefitReadSerializer.Meta):
        fields = (*BenefitReadSerializer.Meta.fields, "provider")


class FolderSelectionPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    collaborator = CollaboratorSelectionSerializer()
    results = FolderSelectedBenefitSerializer(many=True)


class FolderSelectionPagination(PageNumberPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 48


class FolderSelectionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        operation_id="folder_benefits_list",
        parameters=[
            OpenApiParameter("folder_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT, description="24 por defecto; máximo 48"),
        ],
        responses={200: FolderSelectionPageSerializer},
    )
    def get(self, request, folder_id):
        profile = folder_profile(request, folder_id)
        unknown = set(request.query_params) - {"page", "page_size"}
        if unknown:
            raise ValidationError({key: "Parámetro no admitido" for key in sorted(unknown)})
        benefits = selected_benefits(folder_id).select_related("provider").order_by("provider__name", "title", "pk")
        paginator = FolderSelectionPagination()
        page = paginator.paginate_queryset(benefits, request, view=self)
        # Como la red privada, revalidar el acceso vigente antes de exponer datos/medios.
        if not active_folder_access(request.user, profile):
            raise NotFound()
        results = FolderSelectedBenefitSerializer(page, many=True, context={"folder_id": folder_id}).data
        response = paginator.get_paginated_response(results)
        response.data["collaborator"] = {"id": str(profile.pk), "name": collaborator_name(profile)}
        return response
