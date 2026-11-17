from math import ceil

from django.db.models import Count

from credits.models import Consumption
from referrals.models import FolderAccess

from .periods import BUSINESSES_PAGE_SIZE
from .provenance import exclude_activity_demo_tourists, legacy_access_provenance_is_ambiguous


def attributed_visit_report(period, *, collaborator_id=None, page=1):
    if page < 1:
        raise ValueError("El parámetro page debe ser un entero positivo.")

    accesses = FolderAccess.objects.filter(**period.datetime_filters())
    visits = Consumption.objects.filter(
        **period.datetime_filters(),
        state=Consumption.State.VALID,
        collaborator__isnull=False,
        benefit_demo=False,
        provider__demo=False,
    )
    if collaborator_id is not None:
        accesses = accesses.filter(collaborator_id=collaborator_id)
        visits = visits.filter(collaborator_id=collaborator_id)

    accesses = exclude_activity_demo_tourists(accesses)
    if legacy_access_provenance_is_ambiguous(period, accesses):
        linked_clients = {"status": "unavailable", "value": None}
    else:
        linked_clients = {
            "status": "available",
            "value": accesses.values("tourist_id").distinct().count(),
        }

    visits = exclude_activity_demo_tourists(visits)
    valid_attributed_visits = visits.count()
    business_rows = visits.values("provider_id", "provider__name").annotate(
        visits=Count("pk"),
    ).order_by("-visits", "provider__name", "provider_id")
    business_count = business_rows.count()
    page_count = max(1, ceil(business_count / BUSINESSES_PAGE_SIZE))
    if page > page_count:
        raise ValueError("La página solicitada no existe.")

    offset = (page - 1) * BUSINESSES_PAGE_SIZE
    results = [
        {
            "provider_id": str(row["provider_id"]),
            "provider_name": row["provider__name"],
            "visits": row["visits"],
        }
        for row in business_rows[offset:offset + BUSINESSES_PAGE_SIZE]
    ]

    return {
        "period": period.as_dict(),
        "linked_clients": linked_clients,
        "valid_attributed_visits": valid_attributed_visits,
        "businesses": {
            "count": business_count,
            "page": page,
            "page_size": BUSINESSES_PAGE_SIZE,
            "results": results,
        },
    }
