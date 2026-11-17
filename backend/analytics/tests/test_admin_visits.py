from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from administration.models import AdminAudit
from analytics.periods import AnalyticsPeriod, parse_period
from credits.models import Consumption
from providers.models import Benefit, DemoSeedState, Provider
from referrals.models import CollaboratorProfile, FolderAccess

ANALYTICS_TIMEZONE = ZoneInfo("America/Argentina/Ushuaia")
PERIOD_QUERY = {"from": "2026-11-01", "to": "2026-11-30"}
VISITS_URL = "/api/v1/admin/analytics/visits/"


@pytest.fixture
def admin_client():
    admin = User.objects.create_superuser("analytics-admin@example.test", "Secret-123")
    access, _ = issue_session(admin)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client, admin


def local_time(day, hour=0, minute=0, second=0, microsecond=0):
    return datetime.combine(day, time(hour, minute, second, microsecond), tzinfo=ANALYTICS_TIMEZONE)


def create_user(alias, role=User.Role.TOURIST, **kwargs):
    return User.objects.create_user(f"{alias}@example.test", role=role, **kwargs)


def create_profile(alias):
    return CollaboratorProfile.objects.create(
        user=create_user(alias, role=User.Role.COLLABORATOR), enabled=True,
    )


def create_provider(alias, name, *, status="PUBLISHED", demo=False):
    return Provider.objects.create(slug=alias, name=name, status=status, demo=demo)


def create_access(tourist, collaborator, version, created_at):
    with patch("django.utils.timezone.now", return_value=created_at):
        return FolderAccess.objects.create(
            tourist=tourist, collaborator=collaborator, qr_version=version,
        )


def create_consumption(
    tourist,
    provider,
    collaborator,
    created_at,
    *,
    state=Consumption.State.VALID,
    benefit=None,
    benefit_demo=False,
    annulled_by=None,
):
    values = {
        "tourist": tourist,
        "provider": provider,
        "collaborator": collaborator,
        "award": 10,
        "rule_snapshot": {},
        "state": state,
        "benefit_demo": benefit_demo,
    }
    if benefit is not None:
        values.update(benefit_id=benefit.pk, benefit_title=benefit.title)
    if state == Consumption.State.ANNULLED:
        values.update(
            annulled_at=created_at + timedelta(minutes=1),
            annulled_by=annulled_by,
            annul_reason="Prueba de anulación",
        )
    with patch("django.utils.timezone.now", return_value=created_at):
        return Consumption.objects.create(**values)


@pytest.mark.django_db
def test_deduplicates_grants_and_keeps_historical_visits(admin_client):
    client, admin = admin_client
    guide = create_profile("analytics-guide")
    other_guide = create_profile("analytics-other-guide")
    linked_customer = create_user("analytics-linked-customer")
    create_access(linked_customer, guide, 1, local_time(date(2026, 11, 1)))
    create_access(linked_customer, guide, 2, local_time(date(2026, 11, 2)))
    create_access(linked_customer, other_guide, 1, local_time(date(2026, 11, 3)))

    first_provider = create_provider("analytics-cafe", "Café del Canal")
    historical_provider = create_provider("analytics-closed", "Puerto Cerrado", status="INACTIVE")
    create_consumption(
        create_user("analytics-valid-first"), first_provider, guide,
        local_time(date(2026, 11, 1)),
    )
    create_consumption(
        create_user("analytics-valid-last"), historical_provider, guide,
        local_time(date(2026, 11, 30), 23, 59, 59, 999999),
    )

    direct_provider = create_provider("analytics-direct", "Visita directa")
    create_consumption(
        create_user("analytics-direct-customer"), direct_provider, None,
        local_time(date(2026, 11, 12)),
    )
    annulled_provider = create_provider("analytics-annulled", "Visita anulada")
    create_consumption(
        create_user("analytics-annulled-customer"), annulled_provider, guide,
        local_time(date(2026, 11, 13)), state=Consumption.State.ANNULLED, annulled_by=admin,
    )
    demo_provider = create_provider("analytics-demo", "Visita de demostración")
    demo_benefit = Benefit.objects.create(
        provider=demo_provider, title="Oferta de demostración", demo=True,
    )
    create_consumption(
        create_user("analytics-demo-customer"), demo_provider, guide,
        local_time(date(2026, 11, 14)), benefit=demo_benefit, benefit_demo=True,
    )
    provider_demo = create_provider("analytics-demo-provider", "Prestador DEMO", demo=True)
    create_consumption(
        create_user("analytics-demo-provider-customer"), provider_demo, guide,
        local_time(date(2026, 11, 14)),
    )
    outside_provider = create_provider("analytics-outside", "Fuera del período")
    create_consumption(
        create_user("analytics-outside-customer"), outside_provider, guide,
        local_time(date(2026, 12, 1)),
    )

    synthetic_customer = create_user("analytics-seeded-customer")
    AdminAudit.objects.create(
        actor=admin, action="DEMO_ACTIVITY", resource="users", object_id=str(synthetic_customer.pk),
        reason="Marca sintética de prueba",
    )
    create_access(synthetic_customer, guide, 1, local_time(date(2026, 11, 15)))
    synthetic_provider = create_provider("analytics-seeded", "Visita sintética")
    create_consumption(
        synthetic_customer, synthetic_provider, guide, local_time(date(2026, 11, 15)),
    )

    response = client.get(VISITS_URL, PERIOD_QUERY)

    assert response.status_code == 200
    assert response.data == {
        "period": {
            "from": "2026-11-01",
            "to": "2026-11-30",
            "timezone": "America/Argentina/Ushuaia",
        },
        "linked_clients": {"status": "available", "value": 1},
        "valid_attributed_visits": 2,
        "businesses": {
            "count": 2,
            "page": 1,
            "page_size": 25,
            "results": [
                {"provider_id": str(first_provider.pk), "provider_name": "Café del Canal", "visits": 1},
                {"provider_id": str(historical_provider.pk), "provider_name": "Puerto Cerrado", "visits": 1},
            ],
        },
    }
    assert "no-store" in response["Cache-Control"]
    assert "example.test" not in str(response.data)
    assert not {"tourist_id", "client_id", "customer_id", "email"}.intersection(response.data)


@pytest.mark.django_db
def test_legacy_demo_link_is_not_reported_as_real(admin_client):
    client, admin = admin_client
    guide = create_profile("analytics-legacy-guide")
    customer = create_user("analytics-legacy-customer")
    create_access(customer, guide, 1, local_time(date(2026, 11, 10)))
    # The legacy seed marker is created after the direct FolderAccess insert.
    DemoSeedState.objects.create(pk="credits-2026-10-18")

    provider = create_provider("analytics-legacy-visit", "Visita verificada")
    create_consumption(
        create_user("analytics-independent-visit"), provider, guide,
        local_time(date(2026, 11, 16)),
    )

    response = client.get(VISITS_URL, PERIOD_QUERY)

    assert response.status_code == 200
    assert response.data["linked_clients"] == {"status": "unavailable", "value": None}
    assert response.data["valid_attributed_visits"] == 1
    assert response.data["businesses"]["results"] == [
        {"provider_id": str(provider.pk), "provider_name": "Visita verificada", "visits": 1},
    ]


@pytest.mark.django_db
@pytest.mark.parametrize("query", [
    {"from": "2026-11-01"},
    {"to": "2026-11-30"},
    {"from": "2026-02-30", "to": "2026-03-01"},
    {"from": "2026-12-01", "to": "2026-11-30"},
    {"from": "2025-10-31", "to": "2026-11-01"},
    {"from": "2026-11-01", "to": "2026-11-30", "page": "0"},
    {"from": "2026-11-01", "to": "2026-11-30", "page": "no"},
    {"from": "2026-11-01", "to": "2026-11-30", "collaborator_id": "not-a-uuid"},
])
def test_invalid_period_or_page_returns_bad_request(admin_client, query):
    client, _ = admin_client
    assert client.get(VISITS_URL, query).status_code == 400


@pytest.mark.django_db
def test_business_page_does_not_change_visit_total_and_collaborator_filter_is_applied(admin_client):
    client, _ = admin_client
    guide = create_profile("analytics-page-guide")
    other_guide = create_profile("analytics-page-other-guide")
    for index in range(26):
        provider = create_provider(f"analytics-page-{index:02}", f"Comercio {index:02}")
        create_consumption(
            create_user(f"analytics-page-customer-{index}"), provider, guide,
            local_time(date(2026, 11, 10)),
        )
    filtered_provider = create_provider("analytics-filtered-provider", "Comercio filtrado")
    create_consumption(
        create_user("analytics-filtered-customer"), filtered_provider, other_guide,
        local_time(date(2026, 11, 10)),
    )

    page_two = client.get(VISITS_URL, {**PERIOD_QUERY, "page": "2"})
    filtered = client.get(VISITS_URL, {**PERIOD_QUERY, "collaborator_id": str(other_guide.pk)})

    assert page_two.status_code == 200
    assert page_two.data["valid_attributed_visits"] == 27
    assert page_two.data["businesses"] == {
        "count": 27,
        "page": 2,
        "page_size": 25,
        "results": [
            {"provider_id": str(Provider.objects.get(slug="analytics-page-25").pk), "provider_name": "Comercio 25", "visits": 1},
            {"provider_id": str(filtered_provider.pk), "provider_name": "Comercio filtrado", "visits": 1},
        ],
    }
    assert filtered.status_code == 200
    assert filtered.data["valid_attributed_visits"] == 1
    assert filtered.data["linked_clients"] == {"status": "available", "value": 0}
    assert filtered.data["businesses"]["count"] == 1
    assert client.get(VISITS_URL, {**PERIOD_QUERY, "page": "3"}).status_code == 400


def test_default_period_uses_today_and_previous_29_local_civil_days():
    assert parse_period({}, today=date(2026, 11, 16)) == AnalyticsPeriod(
        start=date(2026, 10, 18), end=date(2026, 11, 16),
    )


def test_period_accepts_366_inclusive_dates():
    assert parse_period({"from": "2025-11-01", "to": "2026-11-01"}) == AnalyticsPeriod(
        start=date(2025, 11, 1), end=date(2026, 11, 1),
    )


@pytest.mark.django_db
@pytest.mark.parametrize("role,active,staff,superuser", [
    (User.Role.TOURIST, True, True, False),
    (User.Role.COLLABORATOR, True, True, False),
    (User.Role.PROVIDER, True, True, False),
    (User.Role.ADMIN, False, True, True),
    (User.Role.ADMIN, True, False, True),
    (User.Role.ADMIN, True, True, False),
])
def test_visits_requires_exact_active_program_admin(admin_client, role, active, staff, superuser):
    client, _ = admin_client
    actor = create_user(
        f"analytics-denied-{role.lower()}-{active}-{staff}-{superuser}", role=role,
        is_active=active, is_staff=staff, is_superuser=superuser,
    )
    denied = APIClient()
    denied.force_authenticate(actor)

    assert denied.get(VISITS_URL, PERIOD_QUERY).status_code == 403
    assert APIClient().get(VISITS_URL, PERIOD_QUERY).status_code == 401
    assert client.get(VISITS_URL, PERIOD_QUERY).status_code == 200
