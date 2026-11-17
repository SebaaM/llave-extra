from django.db.models import CharField, Exists, OuterRef
from django.db.models.functions import Cast

from administration.models import AdminAudit
from providers.models import DemoSeedState

DEMO_ACTIVITY_ACTION = "DEMO_ACTIVITY"
DEMO_ACTIVITY_RESOURCE = "users"
LEGACY_ACCESS_SEED_KEY = "credits-2026-10-18"


def exclude_activity_demo_tourists(queryset):
    """Exclude synthetic customers marked by the activity seed's AdminAudit row."""
    audit_marker = AdminAudit.objects.filter(
        action=DEMO_ACTIVITY_ACTION,
        resource=DEMO_ACTIVITY_RESOURCE,
        object_id=Cast(OuterRef("tourist_id"), output_field=CharField()),
    )
    return queryset.annotate(_has_demo_activity_marker=Exists(audit_marker)).filter(
        _has_demo_activity_marker=False,
    )


def legacy_access_provenance_is_ambiguous(period, folder_accesses):
    """Flag legacy rows whose exact synthetic subset is not recorded individually.

    The legacy E4 seed writes FolderAccess rows before the `credits-2026-10-18`
    DemoSeedState marker. That timestamp is an upper bound, not a reliable
    per-row boundary, so any otherwise-eligible access in the queried interval
    before it makes the distinct-client indicator unknowable.
    """
    seeded_at = DemoSeedState.objects.filter(pk=LEGACY_ACCESS_SEED_KEY).values_list("loaded_at", flat=True).first()
    if seeded_at is None:
        return False
    start_at = period.datetime_filters()["created_at__gte"]
    if start_at >= seeded_at:
        return False
    return folder_accesses.filter(created_at__lt=seeded_at).exists()
