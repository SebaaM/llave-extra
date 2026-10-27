from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions
from rest_framework.authentication import SessionAuthentication
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order, Product
from .serializers import (
    CancellationInputSerializer,
    CancellationSerializer,
    CheckoutSerializer,
    OrderSerializer,
    ProductSerializer,
)
from .services import checkout, request_cancellation, require_admin, require_customer


class NoStoreMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response


class ShopPagination(PageNumberPagination):
    page_size = 24


class ProductList(NoStoreMixin, generics.ListAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    queryset = Product.objects.filter(active=True).order_by("name", "pk")
    serializer_class = ProductSerializer
    pagination_class = ShopPagination


class ProductDetail(NoStoreMixin, generics.RetrieveAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    queryset = Product.objects.filter(active=True)
    serializer_class = ProductSerializer


class ProductMedia(NoStoreMixin, APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses={(200, "image/png"): OpenApiTypes.BINARY})
    def get(self, request, pk):
        product = get_object_or_404(Product, pk=pk, active=True)
        if not product.image:
            raise Http404
        try:
            response = FileResponse(product.image.open("rb"))
        except FileNotFoundError:
            raise Http404 from None
        response["X-Content-Type-Options"] = "nosniff"
        return response


class ProductAdminMedia(ProductMedia):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(exclude=True)
    def get(self, request, name):
        require_admin(request.user)
        product = get_object_or_404(Product, image=name)
        try:
            response = FileResponse(product.image.open("rb"))
        except FileNotFoundError:
            raise Http404 from None
        response["X-Content-Type-Options"] = "nosniff"
        return response


class OrderList(NoStoreMixin, generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer
    pagination_class = ShopPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Order.objects.none()
        require_customer(self.request.user, verified=False)
        return Order.objects.filter(customer=self.request.user).prefetch_related("lines", "cancellations").order_by("-created_at", "pk")

    @extend_schema(request=CheckoutSerializer, responses={201: OrderSerializer, 200: OrderSerializer},
                   parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)])
    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order, created = checkout(request.user.pk, **serializer.validated_data,
                                  idempotency_key=request.headers.get("Idempotency-Key", ""))
        return Response(OrderSerializer(order).data, status=201 if created else 200)


class OrderDetail(NoStoreMixin, generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Order.objects.none()
        require_customer(self.request.user, verified=False)
        return Order.objects.filter(customer=self.request.user).prefetch_related("lines", "cancellations")


class OrderCancel(NoStoreMixin, APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=CancellationInputSerializer, responses={200: CancellationSerializer})
    def post(self, request, pk):
        serializer = CancellationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cancellation = request_cancellation(request.user.pk, pk, **serializer.validated_data)
        return Response(CancellationSerializer(cancellation).data)
