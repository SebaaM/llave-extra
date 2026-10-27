from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from credits.models import AdjustmentCase, CreditPolicy
from providers.models import Benefit, CatalogConfig, Provider, Publication
from referrals.models import CollaboratorProfile
from shop.models import CancellationRequest, Order, Product, ShopSettings

from .models import AdminAudit
from .permissions import IsProgramAdmin
from .serializers import AdminAuditSerializer


class DashboardCountsSerializer(serializers.Serializer):
    active_users = serializers.IntegerField()
    published_providers = serializers.IntegerField()
    current_benefits = serializers.IntegerField()
    enabled_collaborators = serializers.IntegerField()


class DashboardQueuesSerializer(serializers.Serializer):
    draft_providers = serializers.IntegerField()
    draft_benefits = serializers.IntegerField()
    orders_to_prepare = serializers.IntegerField()
    orders_to_deliver = serializers.IntegerField()
    open_cancellations = serializers.IntegerField()
    payment_reviews = serializers.IntegerField()
    pending_refunds = serializers.IntegerField()
    unresolved_adjustments = serializers.IntegerField()
    out_of_stock_products = serializers.IntegerField()


class DashboardSettingsSerializer(serializers.Serializer):
    catalog_enabled = serializers.BooleanField()
    pickup_enabled = serializers.BooleanField()
    pickup_configured = serializers.BooleanField()
    base_reward = serializers.IntegerField()
    target_visits = serializers.IntegerField()
    payment_provider = serializers.CharField()


class DashboardSerializer(serializers.Serializer):
    counts = DashboardCountsSerializer()
    queues = DashboardQueuesSerializer()
    settings = DashboardSettingsSerializer()
    recent_activity = AdminAuditSerializer(many=True)
    refreshed_at = serializers.DateTimeField()


class DashboardView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(responses=DashboardSerializer)
    def get(self, request):
        today = timezone.localdate()
        catalog = CatalogConfig.objects.filter(pk=1).first() or CatalogConfig()
        credits = CreditPolicy.objects.filter(pk=1).first() or CreditPolicy()
        shop = ShopSettings.objects.filter(pk=1).first() or ShopSettings()
        counts = {
            "active_users": User.objects.filter(is_active=True).count(),
            "published_providers": Provider.objects.filter(status=Publication.PUBLISHED).count(),
            "current_benefits": Benefit.objects.filter(status=Publication.PUBLISHED,
                provider__status=Publication.PUBLISHED).filter(
                Q(valid_from__isnull=True) | Q(valid_from__lte=today),
                Q(valid_until__isnull=True) | Q(valid_until__gte=today)).count(),
            "enabled_collaborators": CollaboratorProfile.objects.filter(enabled=True, user__is_active=True).count(),
        }
        queues = {
            "draft_providers": Provider.objects.filter(status=Publication.DRAFT).count(),
            "draft_benefits": Benefit.objects.filter(status=Publication.DRAFT).count(),
            "orders_to_prepare": Order.objects.filter(state=Order.State.PAID).count(),
            "orders_to_deliver": Order.objects.filter(state=Order.State.READY).count(),
            "open_cancellations": CancellationRequest.objects.filter(state=CancellationRequest.State.OPEN).count(),
            "payment_reviews": Order.objects.filter(state=Order.State.PAYMENT_REVIEW).count(),
            "pending_refunds": Order.objects.filter(state=Order.State.REFUND_PENDING).count(),
            "unresolved_adjustments": AdjustmentCase.objects.filter(resolved_at__isnull=True).count(),
            "out_of_stock_products": Product.objects.filter(active=True, stock=0).count(),
        }
        activity = AdminAudit.objects.select_related("actor").order_by("-created_at", "-pk")[:10]
        return Response({
            "counts": counts,
            "queues": queues,
            "settings": {"catalog_enabled": catalog.enabled, "pickup_enabled": shop.pickup_enabled,
                         "pickup_configured": bool(shop.pickup_name and shop.pickup_address and shop.pickup_hours),
                         "base_reward": credits.base_reward, "target_visits": credits.target_visits,
                         "payment_provider": settings.SHOP_PAYMENT_PROVIDER},
            "recent_activity": AdminAuditSerializer(activity, many=True).data,
            "refreshed_at": timezone.now(),
        })
