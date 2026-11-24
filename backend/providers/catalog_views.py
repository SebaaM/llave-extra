from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import permissions, serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .catalog import catalog_benefits, catalog_enabled
from .catalog_serializers import PublicBenefitSerializer
from .views import PRIVATE_IMAGE_RESPONSES, private_file

PublicBenefitPageSerializer = inline_serializer(
    "PublicBenefitPage",
    fields={
        "count": serializers.IntegerField(),
        "next": serializers.URLField(allow_null=True),
        "previous": serializers.URLField(allow_null=True),
        "results": PublicBenefitSerializer(many=True),
    },
)


class CatalogPagination(PageNumberPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 48


def require_catalog():
    if not catalog_enabled():
        raise NotFound()


class CatalogConfigView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=inline_serializer("PublicCatalogConfig", fields={"enabled": serializers.BooleanField()}))
    def get(self, request):
        return Response({"enabled": catalog_enabled()})


class CatalogBenefitsView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        operation_id="catalog_benefits_list",
        parameters=[
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT, description="24 por defecto; máximo 48"),
            OpenApiParameter("search", OpenApiTypes.STR),
            OpenApiParameter("category", OpenApiTypes.STR),
            OpenApiParameter("featured", OpenApiTypes.BOOL, description="Opcional; solo true o false. La selección tiene hasta cinco beneficios y sigue sujeta a publicación y vigencia."),
        ],
        responses={200: PublicBenefitPageSerializer, 400: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        require_catalog()
        benefits = catalog_benefits()
        featured = request.query_params.get("featured")
        if featured is not None and featured not in ("true", "false"):
            raise ValidationError({"featured": "Usá true o false."})
        search = request.query_params.get("search", "").strip()
        category = request.query_params.get("category", "")
        for name, value in (("search", search), ("category", category)):
            if "\x00" in value:
                raise ValidationError({name: "El filtro contiene un carácter inválido."})
        trimmed_category = category.strip()
        if trimmed_category:
            if category != trimmed_category and not benefits.filter(provider__category__iexact=category).exists():
                category = trimmed_category
            benefits = benefits.filter(provider__category__iexact=category)
        if search:
            benefits = benefits.filter(
                Q(title__icontains=search) | Q(description__icontains=search)
                | Q(provider__name__icontains=search)
            )
        if featured is not None:
            benefits = benefits.filter(featured=featured == "true")
        benefits = benefits.order_by("provider__name", "title", "pk")
        paginator = CatalogPagination()
        page = paginator.paginate_queryset(benefits, request, view=self)
        return paginator.get_paginated_response(PublicBenefitSerializer(page, many=True).data)


class CatalogCategoriesView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        operation_id="catalog_categories_list",
        description="Categorías de prestadores con beneficios públicos publicados y vigentes.",
        responses=inline_serializer(
            "PublicCatalogCategories",
            fields={"results": serializers.ListField(child=serializers.CharField())},
        ),
    )
    def get(self, request):
        require_catalog()
        categories = set(
            category
            for category in catalog_benefits().values_list("provider__category", flat=True)
            if category and category.strip()
        )
        return Response({"results": sorted(categories, key=lambda value: (value.casefold(), value))})


class CatalogBenefitView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(operation_id="catalog_benefits_retrieve", responses=PublicBenefitSerializer)
    def get(self, request, benefit_id):
        require_catalog()
        benefit = catalog_benefits().filter(pk=benefit_id).first()
        if benefit is None:
            raise NotFound()
        return Response(PublicBenefitSerializer(benefit).data)


class CatalogProviderMediaView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, provider_id):
        require_catalog()
        benefit = catalog_benefits().filter(provider_id=provider_id).first()
        if benefit is None:
            raise NotFound()
        return private_file(benefit.provider.image)


class CatalogBenefitMediaView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=PRIVATE_IMAGE_RESPONSES)
    def get(self, request, benefit_id):
        require_catalog()
        benefit = catalog_benefits().filter(pk=benefit_id).first()
        if benefit is None:
            raise NotFound()
        return private_file(benefit.image)
