from django.db.models import CharField, Count, Exists, Max, OuterRef, Q, Subquery
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


def linked_client_metrics(folder_accesses):
    """Count linked customers and detect legacy overlap in one SQL statement.

    The legacy E4 seed writes FolderAccess rows before the `credits-2026-10-18`
    DemoSeedState marker. That timestamp is an upper bound, not a reliable
    per-row boundary, so any otherwise-eligible access in the queried interval
    before it makes the distinct-client indicator unknowable. Both the distinct
    count and overlap maximum use the same PostgreSQL statement snapshot, so a
    concurrent seed commit cannot be observed in only one of those values.
    """
    seeded_at = Subquery(
        DemoSeedState.objects.filter(pk=LEGACY_ACCESS_SEED_KEY).values("loaded_at")[:1],
    )
    metrics = folder_accesses.aggregate(
        value=Count("tourist_id", distinct=True),
        legacy_overlap=Max("created_at", filter=Q(created_at__lt=seeded_at)),
    )
    if metrics["legacy_overlap"] is not None:
        return {"status": "unavailable", "value": None}
    return {"status": "available", "value": metrics["value"]}
