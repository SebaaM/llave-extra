import hmac

from credits.models import ProviderConsumptionCredential
from credits.services import Conflict
from providers.models import FolderBenefit, Provider, ProviderMembership
from referrals.models import CollaboratorProfile
from shop.models import Product, ProductCategory

from .concurrency import resource_version, signed_digest


def admin_resource_version(instance):
    """Sign exactly the related state shown/changed by admin resource commands."""
    base = resource_version(instance)
    if isinstance(instance, ProductCategory):
        count = getattr(instance, "published_products_count", None)
        if count is None:
            count = instance.products.filter(active=True).count()
        return signed_digest("admin-product-category-version", {"base": base, "published_products_count": count})
    if isinstance(instance, Product):
        category = instance.category if instance.category_id else None
        state = {"id": str(category.pk), "name": category.name, "active": category.active} if category else None
        return signed_digest("admin-product-version", {"base": base, "category": state})
    if isinstance(instance, Provider):
        if "consumption_credential" in instance._state.fields_cache:
            obj = instance._state.fields_cache["consumption_credential"]
            credential = {"qr_version": obj.qr_version, "pin_hash": obj.pin_hash} if obj else None
        else:
            credential = ProviderConsumptionCredential.objects.filter(provider_id=instance.pk).values(
                "qr_version", "pin_hash").first()
        if "memberships" in getattr(instance, "_prefetched_objects_cache", {}):
            members = sorted(row.user_id for row in instance.memberships.all())
        else:
            members = list(ProviderMembership.objects.filter(provider_id=instance.pk).order_by("user_id")
                           .values_list("user_id", flat=True))
        return signed_digest("admin-provider-version", {"base": base, "credential": credential, "members": members})
    if isinstance(instance, CollaboratorProfile):
        if "folder_benefits" in getattr(instance, "_prefetched_objects_cache", {}):
            benefits = sorted(str(row.benefit_id) for row in instance.folder_benefits.all())
        else:
            benefits = [str(pk) for pk in FolderBenefit.objects.filter(collaborator_id=instance.pk)
                        .order_by("benefit_id").values_list("benefit_id", flat=True)]
        return signed_digest("admin-collaborator-version", {"base": base, "benefits": benefits})
    return base


def require_admin_resource_version(instance, version):
    valid = (isinstance(version, str) and len(version) == 64
             and all(char in "0123456789abcdef" for char in version))
    if not valid or not hmac.compare_digest(admin_resource_version(instance), version):
        raise Conflict("El registro cambió o falta su versión. Recargá antes de guardar.")
