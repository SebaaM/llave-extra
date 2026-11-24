import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from credits.models import Consumption
from providers.models import Provider
from referrals.models import CollaboratorProfile, FolderAccess


@pytest.fixture
def summary_data():
    owner = User.objects.create_user("summary-owner@example.test", role=User.Role.COLLABORATOR)
    profile = CollaboratorProfile.objects.create(user=owner, enabled=True)
    admin = User.objects.create_superuser("summary-admin@example.test", "Secret-123")
    client = APIClient()
    client.force_authenticate(admin)
    return client, admin, profile


def url(profile):
    return f"/api/v1/admin/collaborators/{profile.pk}/summary/"


@pytest.mark.django_db
def test_summary_distinct_historical_clients_valid_attribution_and_no_join_multiplication(summary_data, django_assert_num_queries):
    client, admin, profile = summary_data
    tourists = [User.objects.create_user(f"summary-{i}@example.test") for i in range(3)]
    for version in (1, 2, 3):
        FolderAccess.objects.create(tourist=tourists[0], collaborator=profile, qr_version=version)
    FolderAccess.objects.create(tourist=tourists[1], collaborator=profile, qr_version=1)
    other_owner = User.objects.create_user("summary-other@example.test", role=User.Role.COLLABORATOR)
    other_profile = CollaboratorProfile.objects.create(user=other_owner, enabled=True)
    FolderAccess.objects.create(tourist=tourists[2], collaborator=other_profile, qr_version=1)
    for index, (collaborator, state) in enumerate([
        (profile, Consumption.State.VALID), (profile, Consumption.State.VALID),
        (profile, Consumption.State.ANNULLED), (None, Consumption.State.VALID),
        (other_profile, Consumption.State.VALID),
    ]):
        provider = Provider.objects.create(slug=f"summary-{index}", name=f"Local {index}")
        annulled = {"annulled_at": timezone.now(), "annulled_by": admin, "annul_reason": "Prueba"} if state == Consumption.State.ANNULLED else {}
        Consumption.objects.create(tourist=tourists[0], provider=provider, collaborator=collaborator,
                                   award=100, rule_snapshot={}, state=state, **annulled)
    CollaboratorProfile.set_enabled(profile.pk, False)
    with django_assert_num_queries(3):
        response = client.get(url(profile))
    assert response.status_code == 200
    assert response.data == {"collaborator_id": str(profile.pk), "linked_clients": 2, "valid_attributed_consumptions": 2}
    assert "example.test" not in str(response.data)
    assert "no-store" in response["Cache-Control"] and response["Referrer-Policy"] == "no-referrer"


@pytest.mark.django_db
def test_summary_returns_zero_and_missing_collaborator_is_404(summary_data):
    client, _, profile = summary_data
    assert client.get(url(profile)).data == {"collaborator_id": str(profile.pk), "linked_clients": 0, "valid_attributed_consumptions": 0}
    assert client.get(f"/api/v1/admin/collaborators/{uuid.uuid4()}/summary/").status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("role,active,staff,superuser", [
    (User.Role.TOURIST, True, True, False), (User.Role.COLLABORATOR, True, True, False),
    (User.Role.PROVIDER, True, True, False), (User.Role.ADMIN, False, True, True),
    (User.Role.ADMIN, True, False, True), (User.Role.ADMIN, True, True, False),
])
def test_summary_requires_all_admin_flags(summary_data, role, active, staff, superuser):
    _, _, profile = summary_data
    user = User.objects.create_user("denied-summary@example.test", role=role, is_active=active, is_staff=staff, is_superuser=superuser)
    client = APIClient()
    client.force_authenticate(user)
    assert client.get(url(profile)).status_code == 403
    assert APIClient().get(url(profile)).status_code == 401
