from django.db.models import OuterRef, Subquery
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import permissions, serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from referrals.access import active_folder_access

from .catalog import catalog_benefits, catalog_enabled
from .catalog_serializers import PublicProviderSerializer
from .models import CatalogConfig, Provider
from .serializers import ProviderReadSerializer
from .views import folder_profile


class NetworkPresentationSerializer(serializers.Serializer):
    title = serializers.CharField()
    layout = serializers.ChoiceField(choices=("RADIAL", "ORBIT"))
    theme = serializers.ChoiceField(choices=("SAND", "OCEAN"))
    background = serializers.ChoiceField(choices=("HARBOR", "BEAGLE"))
    page_size = serializers.IntegerField()
    interval_seconds = serializers.IntegerField()
    city = serializers.CharField()


class PublicNetworkResultSerializer(serializers.Serializer):
    provider = PublicProviderSerializer()
    benefit_id = serializers.UUIDField()
    benefit_title = serializers.CharField()


class FolderNetworkResultSerializer(serializers.Serializer):
    provider = ProviderReadSerializer()
    benefit_id = serializers.UUIDField()
    benefit_title = serializers.CharField()


def network_page_serializer(name, result_serializer):
    return inline_serializer(name, fields={
        "count": serializers.IntegerField(),
        "next": serializers.URLField(allow_null=True),
        "previous": serializers.URLField(allow_null=True),
        "presentation": NetworkPresentationSerializer(),
        "results": result_serializer(many=True),
    })


PublicNetworkPageSerializer = network_page_serializer("PublicNetworkPage", PublicNetworkResultSerializer)
FolderNetworkPageSerializer = network_page_serializer("FolderNetworkPage", FolderNetworkResultSerializer)


class NetworkPagination(PageNumberPagination):
    page_size_query_param = None
    max_page_size = 15

    def paginate_queryset(self, queryset, request, view=None):
        self.page_size = view.network_config.network_page_size
        return super().paginate_queryset(queryset, request, view=view)


def validate_query(request):
    unknown = set(request.query_params) - {"page"}
    if unknown:
        raise ValidationError({key: "Parámetro no admitido" for key in sorted(unknown)})


def presentation(config):
    return {
        "title": config.network_title,
        "layout": config.network_layout,
        "theme": config.network_theme,
        "background": config.network_background,
        "page_size": config.network_page_size,
        "interval_seconds": config.network_interval_seconds,
        "city": "Ushuaia",
    }


def network_providers(config, folder_id=None):
    eligible = catalog_benefits()
    if folder_id:
        eligible = eligible.filter(folder_selections__collaborator_id=folder_id)
    first_benefit = eligible.filter(provider_id=OuterRef("pk")).order_by("title", "pk")
    return (
        Provider.objects.filter(
            benefits__in=eligible,
        )
        .annotate(network_benefit_id=Subquery(first_benefit.values("pk")[:1]),
                  network_benefit_title=Subquery(first_benefit.values("title")[:1]))
        .order_by("name", "pk")
        .distinct()
    )


class NetworkView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        operation_id="catalog_network_list",
        parameters=[OpenApiParameter("page", OpenApiTypes.INT)],
        responses=PublicNetworkPageSerializer,
    )
    def get(self, request):
        validate_query(request)
        if not catalog_enabled():
            raise NotFound()
        self.network_config = CatalogConfig.objects.get(singleton=1)
        paginator = NetworkPagination()
        page = paginator.paginate_queryset(network_providers(self.network_config), request, view=self)
        results = [{
            "provider": PublicProviderSerializer(provider, context={"request": request}).data,
            "benefit_id": provider.network_benefit_id,
            "benefit_title": provider.network_benefit_title,
        } for provider in page]
        data = paginator.get_paginated_response(results).data
        data["presentation"] = presentation(self.network_config)
        return Response(data)


class FolderNetworkView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        operation_id="folder_network_list",
        parameters=[OpenApiParameter("folder_id", OpenApiTypes.UUID, OpenApiParameter.PATH), OpenApiParameter("page", OpenApiTypes.INT)],
        responses=FolderNetworkPageSerializer,
    )
    def get(self, request, folder_id):
        validate_query(request)
        profile = folder_profile(request, folder_id)
        self.network_config = profile
        paginator = NetworkPagination()
        page = paginator.paginate_queryset(network_providers(profile, folder_id), request, view=self)
        # Recheck current access before serializing media URLs and response data.
        if not active_folder_access(request.user, profile):
            raise NotFound()
        results = [{
            "provider": ProviderReadSerializer(provider, context={"folder_id": folder_id}).data,
            "benefit_id": provider.network_benefit_id,
            "benefit_title": provider.network_benefit_title,
        } for provider in page]
        data = paginator.get_paginated_response(results).data
        data["presentation"] = presentation(profile)
        return Response(data)
