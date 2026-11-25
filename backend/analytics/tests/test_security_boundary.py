from datetime import date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from django.utils.translation import override
from rest_framework.exceptions import NotAuthenticated, NotFound
from rest_framework.test import APIClient

from accounts.models import AuthSession, User
from accounts.security import issue_session
from credits.models import Consumption
from providers.models import Benefit, FolderBenefit, Provider, ProviderMembership, Publication
from referrals.models import CollaboratorProfile

PERIOD = {"from": "2026-11-01", "to": "2026-11-30"}
PROVIDER_URL = "/api/v1/provider/analytics/visits/"
COLLABORATOR_URL = "/api/v1/collaborator/analytics/visits/"
ADMIN_VISITS_URL = "/api/v1/admin/analytics/visits/"
ADMIN_FINANCE_URL = "/api/v1/admin/analytics/finance/"
ANALYTICS_URLS = (PROVIDER_URL, COLLABORATOR_URL, ADMIN_VISITS_URL, ADMIN_FINANCE_URL)
ANALYTICS_KEYS = {
    "period",
    "direct_visits",
    "referred_visits",
    "benefits",
    "other_benefit_visits",
    "linked_clients",
    "valid_attributed_visits",
    "businesses",
    "other_business_visits",
    "valid_visits",
    "credits",
    "shop",
}
ANALYTICS_TIMEZONE = ZoneInfo("America/Argentina/Ushuaia")
SESSION_REVOKED_DETAIL = "Sesión inválida"
ADMIN_PERMISSION_DETAIL = "Se requieren privilegios de Administrador del programa."
COLLABORATOR_PERMISSION_DETAIL = "Solo colaboradores habilitados"

with override(settings.LANGUAGE_CODE):
    AUTH_REQUIRED_DETAIL = str(NotAuthenticated.default_detail)
    PROVIDER_NOT_FOUND_DETAIL = str(NotFound.default_detail)


pytestmark = pytest.mark.django_db


def create_user(alias, role=User.Role.TOURIST, **kwargs):
    return User.objects.create_user(f"{alias}@example.test", role=role, **kwargs)


def create_provider(alias):
    return Provider.objects.create(
        slug=alias,
        name=f"Synthetic provider {alias}",
        status=Publication.PUBLISHED,
        demo=False,
    )


def create_visit(alias, provider, *, collaborator=None, benefit=None):
    customer = create_user(alias)
    when = datetime.combine(date(2026, 11, 10), time(12), tzinfo=ANALYTICS_TIMEZONE)
    values = {
        "tourist": customer,
        "provider": provider,
        "collaborator": collaborator,
        "award": 10,
        "rule_snapshot": {},
        "state": Consumption.State.VALID,
        "benefit_demo": False,
    }
    if benefit is not None:
        values.update(benefit_id=benefit.pk, benefit_title=benefit.title)
    with patch("django.utils.timezone.now", return_value=when):
        return Consumption.objects.create(**values)


def authenticated_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def assert_private_response_headers(response):
    cache_control = response.headers.get("Cache-Control", "").lower()
    assert "no-store" in cache_control
    assert "public" not in cache_control
    assert response.headers.get("Referrer-Policy") == "no-referrer"


def assert_denial_envelope(response, expected_detail):
    assert isinstance(response.data, dict)
    assert set(response.data) == {"detail"}
    assert response.data == {"detail": expected_detail}
    assert isinstance(response.data["detail"], str)
    body = response.content.decode("utf-8").lower()
    assert "@example.test" not in body
    assert '"email"' not in body
    assert '"qr"' not in body
    assert '"pin"' not in body
    assert not any(key in body for key in ANALYTICS_KEYS)
    assert_private_response_headers(response)


def assert_period_fields(report):
    assert set(report["period"]) == {"from", "to", "timezone"}


def test_analytics_routes_reject_missing_and_revoked_sessions_without_report_data():
    for path in ANALYTICS_URLS:
        response = APIClient().get(path, PERIOD)
        assert response.status_code == 401, (path, response.data)
        assert_denial_envelope(response, AUTH_REQUIRED_DETAIL)

    user = create_user("revoked-analytics-session")
    access, _refresh = issue_session(user)
    AuthSession.objects.filter(user=user).update(revoked_at=timezone.now())
    revoked_client = APIClient()
    revoked_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    for path in ANALYTICS_URLS:
        response = revoked_client.get(path, PERIOD)
        assert response.status_code == 401, (path, response.data)
        assert_denial_envelope(response, SESSION_REVOKED_DETAIL)


@pytest.mark.parametrize(
    ("alias", "role", "active", "staff", "superuser"),
    [
        ("tourist", User.Role.TOURIST, True, True, False),
        ("collaborator", User.Role.COLLABORATOR, True, True, False),
        ("provider", User.Role.PROVIDER, True, True, False),
        ("inactive-admin", User.Role.ADMIN, False, True, True),
        ("not-staff-admin", User.Role.ADMIN, True, False, True),
        ("not-superuser-admin", User.Role.ADMIN, True, True, False),
    ],
)
def test_admin_analytics_requires_admin_role_and_every_account_flag(
    alias, role, active, staff, superuser,
):
    user = create_user(
        f"admin-boundary-{alias}",
        role=role,
        is_active=active,
        is_staff=staff,
        is_superuser=superuser,
    )
    client = authenticated_client(user)

    for path in (ADMIN_VISITS_URL, ADMIN_FINANCE_URL):
        response = client.get(path, PERIOD)
        assert response.status_code == 403, (path, alias, response.data)
        assert_denial_envelope(response, ADMIN_PERMISSION_DETAIL)


def test_cross_role_and_disabled_collaborator_requests_return_no_report_data():
    provider_user = create_user("cross-role-provider", role=User.Role.PROVIDER)
    collaborator_user = create_user("cross-role-collaborator", role=User.Role.COLLABORATOR)
    tourist_user = create_user("cross-role-tourist")
    profile = CollaboratorProfile.objects.create(user=collaborator_user, enabled=True)
    provider_client = authenticated_client(provider_user)
    collaborator_client = authenticated_client(collaborator_user)
    tourist_client = authenticated_client(tourist_user)

    response = provider_client.get(COLLABORATOR_URL, PERIOD)
    assert response.status_code == 403
    assert_denial_envelope(response, COLLABORATOR_PERMISSION_DETAIL)

    response = tourist_client.get(COLLABORATOR_URL, PERIOD)
    assert response.status_code == 403
    assert_denial_envelope(response, COLLABORATOR_PERMISSION_DETAIL)

    response = tourist_client.get(PROVIDER_URL, PERIOD)
    assert response.status_code == 404
    assert_denial_envelope(response, PROVIDER_NOT_FOUND_DETAIL)

    profile.enabled = False
    profile.save(update_fields=("enabled",))
    response = collaborator_client.get(COLLABORATOR_URL, PERIOD)
    assert response.status_code == 403
    assert_denial_envelope(response, COLLABORATOR_PERMISSION_DETAIL)


def test_provider_analytics_uses_only_the_current_membership_after_reassignment():
    provider_user = create_user("reassigned-provider", role=User.Role.PROVIDER)
    previous_provider = create_provider("reassigned-previous")
    current_provider = create_provider("reassigned-current")
    membership = ProviderMembership.objects.create(user=provider_user, provider=previous_provider)
    client = authenticated_client(provider_user)

    create_visit("previous-provider-visit", previous_provider)
    create_visit("current-provider-visit-one", current_provider)
    create_visit("current-provider-visit-two", current_provider)
    previous_report = client.get(PROVIDER_URL, PERIOD)
    assert previous_report.status_code == 200
    assert previous_report.data["direct_visits"] == 1

    membership.provider = current_provider
    membership.save(update_fields=("provider",))
    current_report = client.get(PROVIDER_URL, PERIOD)

    assert current_report.status_code == 200
    assert current_report.data["direct_visits"] == 2
    assert current_report.data["referred_visits"] == 0
    assert "provider_id" not in current_report.data
    assert_private_response_headers(current_report)


def test_successful_analytics_reports_have_allowlisted_fields_and_private_cache_policy():
    provider_user = create_user("allowlist-provider", role=User.Role.PROVIDER)
    provider = create_provider("allowlist-provider-business")
    ProviderMembership.objects.create(user=provider_user, provider=provider)
    collaborator_user = create_user("allowlist-collaborator", role=User.Role.COLLABORATOR)
    CollaboratorProfile.objects.create(user=collaborator_user, enabled=True)
    admin = User.objects.create_superuser("allowlist-admin@example.test", "Synthetic-Admin-Password-42!")

    responses = [
        (authenticated_client(provider_user).get(PROVIDER_URL, PERIOD), {
            "period", "direct_visits", "referred_visits", "benefits", "other_benefit_visits",
        }),
        (authenticated_client(collaborator_user).get(COLLABORATOR_URL, PERIOD), {
            "period", "linked_clients", "valid_attributed_visits", "businesses", "other_business_visits",
        }),
        (authenticated_client(admin).get(ADMIN_VISITS_URL, PERIOD), {
            "period", "linked_clients", "valid_attributed_visits", "businesses",
        }),
        (authenticated_client(admin).get(ADMIN_FINANCE_URL, PERIOD), {
            "period", "valid_visits", "credits", "shop",
        }),
    ]

    for response, expected_fields in responses:
        assert response.status_code == 200, response.data
        assert set(response.data) == expected_fields
        assert_period_fields(response.data)
        assert_private_response_headers(response)
        body = response.content.decode()
        assert "@example.test" not in body
        assert '"email"' not in body
        assert '"qr"' not in body.lower()
        assert '"pin"' not in body.lower()

    provider_report = responses[0][0].data
    for row in provider_report["benefits"]:
        assert set(row) == {"benefit_id", "benefit_title", "visits"}

    for report in (responses[1][0].data, responses[2][0].data):
        assert set(report["linked_clients"]) == {"status", "value"}
        businesses = report["businesses"]
        assert set(businesses) == {"count", "page", "page_size", "results"}
        for row in businesses["results"]:
            assert set(row) == {"provider_id", "provider_name", "visits"}

    finance = responses[3][0].data
    assert set(finance["valid_visits"]) == {"direct", "referred"}
    assert set(finance["credits"]) == {"earn", "reversal", "redeem", "refund", "adjustment"}
    assert set(finance["shop"]) == {
        "credit_redemptions", "confirmed_ars", "refunded_ars", "undated_confirmations_count",
    }
    for group in (finance["valid_visits"], finance["credits"], finance["shop"]):
        for metric in group.values():
            assert set(metric) == {"status", "value"}


def test_analytics_query_count_per_page_does_not_grow_with_source_rows():
    provider_user = create_user("query-count-provider", role=User.Role.PROVIDER)
    collaborator_user = create_user("query-count-collaborator", role=User.Role.COLLABORATOR)
    admin = User.objects.create_superuser("query-count-admin@example.test", "Synthetic-Admin-Password-52!")
    provider = create_provider("query-count-business")
    ProviderMembership.objects.create(user=provider_user, provider=provider)
    profile = CollaboratorProfile.objects.create(user=collaborator_user, enabled=True)
    benefit = Benefit.objects.create(
        provider=provider,
        title="Synthetic selected benefit",
        conditions="Synthetic conditions",
        status=Publication.PUBLISHED,
    )
    FolderBenefit.assign(profile.pk, benefit.pk)
    clients = (
        (authenticated_client(provider_user), PROVIDER_URL),
        (authenticated_client(collaborator_user), COLLABORATOR_URL),
        (authenticated_client(admin), ADMIN_VISITS_URL),
        (authenticated_client(admin), ADMIN_FINANCE_URL),
    )

    def add_pair(index):
        create_visit(f"query-count-direct-{index}", provider)
        create_visit(f"query-count-referred-{index}", provider, collaborator=profile, benefit=benefit)

    def add_distinct_groups(index):
        provider_benefit = Benefit.objects.create(
            provider=provider,
            title=f"Synthetic provider benefit {index}",
            conditions="Synthetic conditions",
            status=Publication.PUBLISHED,
        )
        FolderBenefit.assign(profile.pk, provider_benefit.pk)
        create_visit(
            f"query-count-provider-benefit-{index}",
            provider,
            collaborator=profile,
            benefit=provider_benefit,
        )

        other_provider = create_provider(f"query-count-distinct-provider-{index}")
        other_benefit = Benefit.objects.create(
            provider=other_provider,
            title=f"Synthetic business benefit {index}",
            conditions="Synthetic conditions",
            status=Publication.PUBLISHED,
        )
        FolderBenefit.assign(profile.pk, other_benefit.pk)
        create_visit(
            f"query-count-distinct-business-{index}",
            other_provider,
            collaborator=profile,
            benefit=other_benefit,
        )

    def query_counts_and_reports():
        counts = []
        reports = {}
        for client, path in clients:
            with CaptureQueriesContext(connection) as queries:
                response = client.get(path, PERIOD)
            assert response.status_code == 200, (path, response.data)
            assert_private_response_headers(response)
            counts.append((path, len(queries)))
            reports[path] = response.data
        return counts, reports

    def assert_group_cardinality(reports, expected):
        assert len(reports[PROVIDER_URL]["benefits"]) == expected
        for path in (COLLABORATOR_URL, ADMIN_VISITS_URL):
            businesses = reports[path]["businesses"]
            assert businesses["count"] == expected
            assert businesses["page"] == 1
            assert businesses["page_size"] == 25
            assert len(businesses["results"]) == expected

    add_pair(0)
    initial_counts, initial_reports = query_counts_and_reports()
    assert_group_cardinality(initial_reports, expected=1)

    for index in range(1, 20):
        add_pair(index)
        add_distinct_groups(index)

    expanded_counts, expanded_reports = query_counts_and_reports()

    assert expanded_counts == initial_counts
    assert_group_cardinality(expanded_reports, expected=20)