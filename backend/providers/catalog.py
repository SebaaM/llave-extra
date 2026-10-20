"""Public catalog policy. Folder and referral access lives in a separate namespace."""

from django.db.models import Q
from django.utils import timezone

from .models import Benefit, CatalogConfig, Publication


def catalog_enabled():
    config, _ = CatalogConfig.objects.get_or_create(singleton=1, defaults={"enabled": True})
    return config.enabled


def catalog_benefits():
    """Published benefits of published providers within inclusive local dates."""
    today = timezone.localdate()
    return Benefit.objects.filter(
        status=Publication.PUBLISHED,
        provider__status=Publication.PUBLISHED,
    ).filter(
        Q(valid_from__isnull=True) | Q(valid_from__lte=today),
        Q(valid_until__isnull=True) | Q(valid_until__gte=today),
    ).select_related("provider")
