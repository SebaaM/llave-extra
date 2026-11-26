from datetime import UTC, date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import Commission, CommissionEvent, CommissionState
from credits.models import Consumption
from providers.models import Benefit, FolderBenefit, Provider, Publication
from referrals.models import CollaboratorProfile, FolderAccess
from referrals.views import current_profile as resolve_current_profile

pytestmark = pytest.mark.django_db

PERIOD = {"from": "2026-11-01", "to": "2026-11-30"}
VISITS_URL = "/api/v1/collaborator/analytics/visits/"
COMMISSIONS_URL = "/api/v1/collaborator/commissions/"
ANALYTICS_TIMEZONE = ZoneInfo("America/Argentina/Ushuaia")


@pytest.fixture

def collaborator_account():
    user = create_user("analytics-collaborator", role=User.Role.COLLABORATOR)
    profile = CollaboratorProfile.objects.create(user=user, enabled=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user, profile


def local_time(day, hour=0, minute=0):
    return datetime.combine(date.fromisoformat(day), time(hour, minute), tzinfo=ANALYTICS_TIMEZONE)


def create_user(alias, role=User.Role.TOURIST):
    return User.objects.create_user(f"{alias}@example.test", role=role)


def create_provider(alias, *, status=Publication.PUBLISHED, demo=False):
    return Provider.objects.create(slug=alias, name=f"Negocio {alias}", status=status, demo=demo)


def create_benefit(provider, profile, title):
    benefit = Benefit.objects.create(provider=provider, title=title, conditions="Condiciones", status=Publication.PUBLISHED)
    FolderBenefit.assign(profile.pk, benefit.pk)
    return benefit


def create_visit(alias, provider, *, collaborator, benefit=None, created_at=None, state=Consumption.State.VALID,
                 benefit_demo=False):
    tourist = create_user(alias)
    when = created_at or local_time("2026-11-05")
    with patch("django.utils.timezone.now", return_value=when):
        return Consumption.objects.create(
            tourist=tourist,
            provider=provider,
            collaborator=collaborator,
            award=10,
            rule_snapshot={},
            state=state,
            benefit_id=benefit.pk if benefit else None,
            benefit_title=benefit.title if benefit else None,
            benefit_demo=benefit_demo,
        )


def link_client(profile, alias="analytics-linked-client"):
    tourist = create_user(alias)
    with patch("django.utils.timezone.now", return_value=local_time("2026-11-04")):
        FolderAccess.objects.create(
            tourist=tourist,
            collaborator=profile,
            qr_version=profile.qr_version,
        )
    return tourist


@pytest.mark.parametrize("retirement", ["selection_removed", "business_unpublished"])
def test_removed_or_unpublished_business_is_aggregated_without_name(collaborator_account, retirement):
    client, _user, profile = collaborator_account
    visible_provider = create_provider("analytics-visible")
    visible_benefit = create_benefit(visible_provider, profile, "Oferta vigente")
    retired_provider = create_provider("analytics-retired")
    retired_benefit = create_benefit(retired_provider, profile, "Oferta histórica no visible")
    create_visit("analytics-visible-one", visible_provider, collaborator=profile, benefit=visible_benefit)
    create_visit("analytics-visible-two", visible_provider, collaborator=profile, benefit=visible_benefit)
    create_visit("analytics-retired-visit", retired_provider, collaborator=profile, benefit=retired_benefit)
    link_client(profile)

    if retirement == "selection_removed":
        FolderBenefit.remove(profile.pk, retired_benefit.pk)
    else:
        Provider.objects.filter(pk=retired_provider.pk).update(status=Publication.DRAFT)

    response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 200, getattr(response, "data", response.content)
    assert response.data["period"] == {
        "from": "2026-11-01",
        "to": "2026-11-30",
        "timezone": "America/Argentina/Ushuaia",
    }
    assert response.data["linked_clients"] == {"status": "available", "value": 1}
    assert response.data["valid_attributed_visits"] == 3
    assert response.data["businesses"] == {
        "count": 1,
        "page": 1,
        "page_size": 25,
        "results": [{
            "provider_id": str(visible_provider.pk),
            "provider_name": visible_provider.name,
            "visits": 2,
        }],
    }
    assert response.data["other_business_visits"] == 1
    assert str(retired_provider.pk) not in response.content.decode()
    assert retired_provider.name not in response.content.decode()
    assert retired_benefit.title not in response.content.decode()
    assert "example.test" not in response.content.decode()
    assert "no-store" in response["Cache-Control"]


@pytest.mark.django_db

def test_analytics_uses_only_the_request_collaborators_current_profile(collaborator_account):
    client, _user, profile = collaborator_account
    owner_provider = create_provider("analytics-owner-only")
    benefit = create_benefit(owner_provider, profile, "Selección propia")
    create_visit("analytics-owner-visit", owner_provider, collaborator=profile, benefit=benefit)

    other_user = create_user("analytics-other", role=User.Role.COLLABORATOR)
    CollaboratorProfile.objects.create(user=other_user, enabled=True)
    other_client = APIClient()
    other_client.force_authenticate(user=other_user)
    response = other_client.get(VISITS_URL, {**PERIOD, "collaborator_id": str(profile.pk)})

    assert response.status_code == 200, getattr(response, "data", response.content)
    assert response.data["valid_attributed_visits"] == 0
    assert response.data["businesses"]["count"] == 0
    assert response.data["businesses"]["results"] == []
    assert str(profile.pk) not in response.content.decode()
    assert owner_provider.name not in response.content.decode()

    profile.enabled = False
    profile.save(update_fields=("enabled",))
    disabled_response = client.get(VISITS_URL, PERIOD)
    assert disabled_response.status_code == 403
    assert "valid_attributed_visits" not in disabled_response.content.decode()

    tourist_client = APIClient()
    tourist_client.force_authenticate(user=create_user("analytics-tourist"))
    assert tourist_client.get(VISITS_URL, PERIOD).status_code == 403


@pytest.mark.django_db

def test_business_pagination_does_not_change_totals_or_other_business_visits(collaborator_account):
    client, _user, profile = collaborator_account
    for index in range(26):
        provider = create_provider(f"analytics-page-{index:02d}")
        benefit = create_benefit(provider, profile, f"Oferta {index:02d}")
        create_visit(f"analytics-page-customer-{index:02d}", provider, collaborator=profile, benefit=benefit)

    first = client.get(VISITS_URL, {**PERIOD, "page": 1})
    second = client.get(VISITS_URL, {**PERIOD, "page": 2})

    assert first.status_code == 200, getattr(first, "data", first.content)
    assert second.status_code == 200, getattr(second, "data", second.content)
    assert first.data["valid_attributed_visits"] == second.data["valid_attributed_visits"] == 26
    assert first.data["businesses"]["count"] == second.data["businesses"]["count"] == 26
    assert first.data["businesses"]["page_size"] == second.data["businesses"]["page_size"] == 25
    assert len(first.data["businesses"]["results"]) == 25
    assert len(second.data["businesses"]["results"]) == 1
    assert first.data["other_business_visits"] == second.data["other_business_visits"] == 0


@pytest.mark.django_db(transaction=True)

def test_report_totals_and_businesses_share_one_postgres_snapshot(collaborator_account):
    client, _user, profile = collaborator_account
    provider = create_provider("analytics-snapshot")
    benefit = create_benefit(provider, profile, "Oferta de la misma instantánea")
    create_visit("analytics-snapshot-before", provider, collaborator=profile, benefit=benefit)
    inserted = False

    def insert_after_report_query(execute, sql, params, many, context):
        nonlocal inserted
        result = execute(sql, params, many, context)
        lowered_sql = sql.lower()
        if not inserted and Consumption._meta.db_table.lower() in lowered_sql and "count(" in lowered_sql:
            inserted = True
            create_visit("analytics-snapshot-between-reads", provider, collaborator=profile, benefit=benefit)
        return result

    with connection.execute_wrapper(insert_after_report_query):
        response = client.get(VISITS_URL, PERIOD)

    assert inserted
    assert response.status_code == 200, getattr(response, "data", response.content)
    assert response.data["valid_attributed_visits"] == 1
    assert response.data["businesses"]["results"] == [{
        "provider_id": str(provider.pk),
        "provider_name": provider.name,
        "visits": 1,
    }]
    assert response.data["other_business_visits"] == 0


@pytest.mark.django_db

def test_collaborator_commissions_endpoint_keeps_its_existing_history_and_amounts(collaborator_account):
    client, user, profile = collaborator_account
    provider = create_provider("analytics-commission-history")
    benefit = create_benefit(provider, profile, "Oferta con comisión")
    consumption = create_visit(
        "analytics-commission-customer",
        provider,
        collaborator=profile,
        benefit=benefit,
    )
    commission = Commission.objects.create(
        consumption=consumption,
        verified_rate="7.00",
        verified_source="BENEFIT",
    )
    declared = CommissionEvent.objects.create(
        commission=commission,
        actor=user,
        actor_name="Prestador",
        kind="DECLARED",
        created_at=datetime(2026, 11, 10, tzinfo=UTC),
        outcome="CONSUMED",
        amount="100.00",
    )
    commission.declaration = declared
    commission.state = CommissionState.TO_PAY
    commission.save(update_fields=("declaration", "state"))
    approval = CommissionEvent.objects.create(
        commission=commission,
        actor=user,
        actor_name="Administrador",
        kind="APPROVED",
        created_at=datetime(2026, 11, 11, tzinfo=UTC),
        basis=declared,
        base_amount="100.00",
        rate="7.00",
        amount="7.00",
        rule_source="BENEFIT",
        currency="ARS",
        bank_version="00000000-0000-4000-8000-000000000001",
    )
    commission.approval = approval
    commission.save(update_fields=("approval",))

    response = client.get(COMMISSIONS_URL)

    assert response.status_code == 200, getattr(response, "data", response.content)
    assert response.data["count"] == 1
    assert response.data["pending_total"] == "7.00"
    assert response.data["results"][0]["approved_amount"] == "7.00"
    assert response.data["results"][0]["provider_name"] == provider.name
    assert str(profile.pk) not in response.content.decode()
@pytest.mark.parametrize("scope_change", ["profile_disabled", "user_inactive", "role_changed"])
def test_report_rechecks_enabled_role_and_user_status_after_profile_resolution(collaborator_account, scope_change):
    client, user, profile = collaborator_account
    provider = create_provider("analytics-scope-recheck")
    benefit = create_benefit(provider, profile, "Oferta visible antes del cambio")
    create_visit("analytics-scope-recheck-customer", provider, collaborator=profile, benefit=benefit)

    def change_scope_after_resolving(request_user):
        resolved = resolve_current_profile(request_user)
        if scope_change == "profile_disabled":
            CollaboratorProfile.objects.filter(pk=resolved.pk).update(enabled=False)
        elif scope_change == "user_inactive":
            User.objects.filter(pk=user.pk).update(is_active=False)
        else:
            User.objects.filter(pk=user.pk).update(role=User.Role.PROVIDER)
        return resolved

    with patch("analytics.collaborator_views.current_profile", side_effect=change_scope_after_resolving):
        response = client.get(VISITS_URL, PERIOD)

    assert response.status_code == 403
    assert b"valid_attributed_visits" not in response.content
    assert provider.name.encode() not in response.content

def test_page_offset_beyond_postgres_bigint_is_rejected_before_report_query(collaborator_account):
    client, _user, _profile = collaborator_account
    client.raise_request_exception = False

    with CaptureQueriesContext(connection) as queries:
        response = client.get(VISITS_URL, {**PERIOD, "page": "99999999999999999999"})

    assert response.status_code == 400
    assert not any(Consumption._meta.db_table.lower() in query["sql"].lower() for query in queries.captured_queries)