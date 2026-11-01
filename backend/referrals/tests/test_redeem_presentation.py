import pytest
from rest_framework.test import APIClient

from accounts.models import User
from referrals.access import sign_qr
from referrals.models import CollaboratorProfile, FolderAccess


@pytest.mark.django_db
@pytest.mark.parametrize("first,last,expected", [("Ana", "Pérez", "Ana Pérez"), ("  ", "  ", "tu guía local")])
def test_redeem_exposes_safe_collaborator_name_without_email(first, last, expected):
    owner = User.objects.create_user("private-name@example.test", role=User.Role.COLLABORATOR, first_name=first, last_name=last)
    profile = CollaboratorProfile.objects.create(user=owner, enabled=True)
    tourist = User.objects.create_user("redeem-name@example.test")
    client = APIClient()
    client.force_authenticate(tourist)
    first_response = client.post("/api/v1/referrals/redeem/", {"token": sign_qr(profile)}, format="json")
    second_response = client.post("/api/v1/referrals/redeem/", {"token": sign_qr(profile)}, format="json")
    assert first_response.status_code == second_response.status_code == 200
    assert first_response.data == second_response.data
    assert set(first_response.data) == {"collaborator_id", "collaborator_name", "granted_at"}
    assert first_response.data["collaborator_id"] == str(profile.pk)
    assert first_response.data["collaborator_name"] == expected
    assert "example.test" not in str(first_response.data)
    assert FolderAccess.objects.filter(tourist=tourist, collaborator=profile).count() == 1
