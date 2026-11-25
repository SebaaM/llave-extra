from datetime import date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from administration.models import AdminAudit
from credits.models import Consumption
from providers.models import Benefit, Provider, ProviderMembership
from referrals.models import CollaboratorProfile

PERIOD = {"from": "2026-11-01", "to": "2026-11-30"}
VISITS_URL = "/api/v1/provider/analytics/visits/"
ANALYTICS_TIMEZONE = ZoneInfo("America/Argentina/Ushuaia")


@pytest.fixture
def provider_account():
    user = create_user("analytics-provider", role=User.Role.PROVIDER)
    access, _ = issue_session(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client, user


def local_time(day, hour=0, minute=0):
    return datetime.combine(date.fromisoformat(day), time(hour, minute), tzinfo=ANALYTICS_TIMEZONE)


def create_user(alias, role=User.Role.TOURIST, **kwargs):
    return User.objects.create_user(f"{alias}@example.test", role=role, **kwargs)


def create_provider(alias, *, demo=False):
    return Provider.objects.create(slug=alias, name=f"Negocio {alias}", demo=demo)


def create_collaborator(alias):
    return CollaboratorProfile.objects.create(
        user=create_user(alias, role=User.Role.COLLABORATOR),
        enabled=True,
    )


def create_consumption(
    alias,
    provider,
    created_at,
    *,
    collaborator=None,
    benefit=None,
    benefit_title=None,
    benefit_demo=False,
    state=Consumption.State.VALID,
    annulled_by=None,
    tourist=None,
):
    values = {
        "tourist": tourist or create_user(alias),
        "provider": provider,
        "collaborator": collaborator,
        "award": 10,
        "rule_snapshot": {},
        "state": state,
        "benefit_demo": benefit_demo,
    }
    if benefit is not None:
        values["benefit_id"] = benefit.pk
        values["benefit_title"] = benefit_title or benefit.title
    if state == Consumption.State.ANNULLED:
        values.update(
            annulled_at=created_at,
            annulled_by=annulled_by,
            annul_reason="Prueba de anulación",
        )
    with patch("django.utils.timezone.now", return_value=created_at):
        return Consumption.objects.create(**values)


@pytest.mark.django_db
def test_assigned_business_changes_scope_without_exposing_previous_data(provider_account):
    client, user = provider_account
    former_provider = create_provider("analytics-former")
    assigned_provider = create_provider("analytics-current")
    membership = ProviderMembership.objects.create(user=user, provider=former_provider)
    create_consumption("analytics-former-customer", former_provider, local_time("2026-11-05"))
    create_consumption("analytics-current-customer", assigned_provider, local_time("2026-11-06"))

    former_response = client.get(VISITS_URL, PERIOD)
    assert former_response.status_code == 200
    assert former_response.data["direct_visits"] == 1

    membership.provider = assigned_provider
    membership.save(update_fields=("provider",))
    response = client.get(
        VISITS_URL,
        {**PERIOD, "provider_id": str(former_provider.pk)},
    )

    assert response.status_code == 200
    assert response.data == {
        "period": {
            "from": "2026-11-01",
            "to": "2026-11-30",
            "timezone": "America/Argentina/Ushuaia",
        },
        "direct_visits": 1,
        "referred_visits": 0,
        "benefits": [],
        "other_benefit_visits": 0,
    }
    assert str(former_provider.pk) not in str(response.data)
    assert "analytics-former" not in str(response.data)
    assert "example.test" not in str(response.data)
    assert "no-store" in response["Cache-Control"]


@pytest.mark.django_db
def test_provider_without_assigned_business_receives_404(provider_account):
    client, _user = provider_account

    response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 404
    assert b"benefits" not in response.content


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("role", "is_active"),
    [
        (User.Role.TOURIST, True),
        (User.Role.PROVIDER, False),
    ],
)
def test_wrong_role_or_inactive_provider_cannot_read_activity(role, is_active):
    user = create_user("analytics-denied", role=role, is_active=is_active)
    provider = create_provider("analytics-denied")
    ProviderMembership.objects.create(user=user, provider=provider)
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 403
    assert b"benefits" not in response.content


@pytest.mark.django_db
def test_report_counts_valid_direct_referred_and_null_benefit_while_excluding_demo_activity(provider_account):
    client, user = provider_account
    provider = create_provider("analytics-owned")
    ProviderMembership.objects.create(user=user, provider=provider)
    collaborator = create_collaborator("analytics-collaborator")
    historical_benefit = Benefit.objects.create(provider=provider, title="Oferta actual")
    demo_benefit = Benefit.objects.create(provider=provider, title="Oferta DEMO", demo=True)
    create_consumption(
        "analytics-direct",
        provider,
        local_time("2026-11-01"),
    )
    create_consumption(
        "analytics-referred-with-benefit",
        provider,
        local_time("2026-11-02"),
        collaborator=collaborator,
        benefit=historical_benefit,
        benefit_title="Título histórico",
    )
    create_consumption(
        "analytics-referred-without-benefit",
        provider,
        local_time("2026-11-03"),
        collaborator=collaborator,
    )
    create_consumption(
        "analytics-demo-benefit",
        provider,
        local_time("2026-11-04"),
        collaborator=collaborator,
        benefit=demo_benefit,
        benefit_demo=True,
    )
    admin = User.objects.create_superuser("analytics-admin@example.test", "Secret-123")
    synthetic_customer = create_user("analytics-demo-customer")
    AdminAudit.objects.create(
        actor=admin,
        action="DEMO_ACTIVITY",
        resource="users",
        object_id=str(synthetic_customer.pk),
        reason="Marca sintética de prueba",
    )
    create_consumption(
        "analytics-demo-customer",
        provider,
        local_time("2026-11-05"),
        collaborator=collaborator,
        tourist=synthetic_customer,
    )
    create_consumption(
        "analytics-annulled",
        provider,
        local_time("2026-11-06"),
        collaborator=collaborator,
        state=Consumption.State.ANNULLED,
        annulled_by=admin,
    )
    create_consumption(
        "analytics-outside-period",
        provider,
        local_time("2026-12-01"),
    )

    with CaptureQueriesContext(connection) as queries:
        response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 200
    assert response.data["direct_visits"] == 1
    assert response.data["referred_visits"] == 2
    assert response.data["period"]["timezone"] == "America/Argentina/Ushuaia"
    assert response.data["benefits"] == [
        {"benefit_id": None, "benefit_title": None, "visits": 1},
        {"benefit_id": str(historical_benefit.pk), "benefit_title": "Título histórico", "visits": 1},
    ]
    assert response.data["other_benefit_visits"] == 0
    assert "example.test" not in str(response.data)
    consumption_queries = [
        query["sql"] for query in queries.captured_queries
        if Consumption._meta.db_table.lower() in query["sql"].lower()
    ]
    assert len(consumption_queries) == 1


@pytest.mark.django_db
def test_demo_provider_activity_is_not_reported(provider_account):
    client, user = provider_account
    demo_provider = create_provider("analytics-demo-business", demo=True)
    ProviderMembership.objects.create(user=user, provider=demo_provider)
    create_consumption("analytics-demo-business-customer", demo_provider, local_time("2026-11-10"))

    response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 200
    assert response.data["direct_visits"] == 0
    assert response.data["referred_visits"] == 0
    assert response.data["benefits"] == []
    assert response.data["other_benefit_visits"] == 0


@pytest.mark.django_db
def test_benefit_breakdown_is_limited_to_25_rows_and_reports_the_remainder(provider_account):
    client, user = provider_account
    provider = create_provider("analytics-many-benefits")
    ProviderMembership.objects.create(user=user, provider=provider)
    collaborator = create_collaborator("analytics-many-benefits-collaborator")
    for index in range(26):
        benefit = Benefit.objects.create(provider=provider, title=f"Oferta {index:02d}")
        create_consumption(
            f"analytics-many-benefits-customer-{index}",
            provider,
            local_time("2026-11-10"),
            collaborator=collaborator,
            benefit=benefit,
        )

    response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 200
    assert response.data["referred_visits"] == 26
    assert len(response.data["benefits"]) == 25
    assert response.data["other_benefit_visits"] == 1
    assert sum(row["visits"] for row in response.data["benefits"]) + response.data["other_benefit_visits"] == 26

@pytest.mark.django_db(transaction=True)
def test_report_totals_and_benefits_share_one_postgres_snapshot(provider_account):
    client, user = provider_account
    provider = create_provider("analytics-snapshot")
    ProviderMembership.objects.create(user=user, provider=provider)
    collaborator = create_collaborator("analytics-snapshot-collaborator")
    benefit = Benefit.objects.create(provider=provider, title="Oferta de la misma instantánea")
    create_consumption(
        "analytics-snapshot-before",
        provider,
        local_time("2026-11-10"),
        collaborator=collaborator,
        benefit=benefit,
    )
    inserted = False

    def insert_after_report_query(execute, sql, params, many, context):
        nonlocal inserted
        result = execute(sql, params, many, context)
        lowered_sql = sql.lower()
        if (
            not inserted
            and Consumption._meta.db_table.lower() in lowered_sql
            and "count(" in lowered_sql
        ):
            inserted = True
            create_consumption(
                "analytics-snapshot-between-reads",
                provider,
                local_time("2026-11-11"),
                collaborator=collaborator,
                benefit=benefit,
            )
        return result

    with connection.execute_wrapper(insert_after_report_query):
        response = client.get(VISITS_URL, PERIOD)

    assert inserted
    assert response.status_code == 200
    assert response.data["referred_visits"] == 1
    assert response.data["benefits"] == [
        {
            "benefit_id": str(benefit.pk),
            "benefit_title": "Oferta de la misma instantánea",
            "visits": 1,
        },
    ]
    assert response.data["other_benefit_visits"] == 0


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    ("mutation", "expected_status"),
    [
        ("membership_removed", 404),
        ("membership_reassigned", 404),
        ("user_inactive", 403),
        ("user_rerolled", 403),
    ],
)
def test_report_query_rechecks_current_membership_and_provider_role(
    provider_account,
    mutation,
    expected_status,
):
    client, user = provider_account
    provider = create_provider("analytics-revoked-during-read")
    membership = ProviderMembership.objects.create(user=user, provider=provider)
    replacement_provider = create_provider("analytics-reassigned-during-read")
    create_consumption(
        "analytics-revoked-customer",
        provider,
        local_time("2026-11-10"),
    )
    mutation_applied = False

    def mutate_before_report_query(execute, sql, params, many, context):
        nonlocal mutation_applied
        lowered_sql = sql.lower()
        if (
            not mutation_applied
            and Consumption._meta.db_table.lower() in lowered_sql
            and "count(" in lowered_sql
        ):
            mutation_applied = True
            if mutation == "membership_removed":
                membership.delete()
            elif mutation == "membership_reassigned":
                ProviderMembership.objects.filter(pk=membership.pk).update(
                    provider=replacement_provider,
                )
            elif mutation == "user_inactive":
                User.objects.filter(pk=user.pk).update(is_active=False)
            else:
                User.objects.filter(pk=user.pk).update(role=User.Role.TOURIST)
        return execute(sql, params, many, context)

    with connection.execute_wrapper(mutate_before_report_query):
        response = client.get(VISITS_URL, PERIOD)

    assert mutation_applied
    assert response.status_code == expected_status
    assert b"direct_visits" not in response.content
    assert b"referred_visits" not in response.content
