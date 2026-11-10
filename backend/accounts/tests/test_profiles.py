from base64 import urlsafe_b64encode

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User

PROFILE = "/api/v1/auth/profile/"
BANK = "/api/v1/auth/bank-details/"
CBU = "0000001702051342910056"
KEY = urlsafe_b64encode(bytes(range(32))).decode().rstrip("=")
pytestmark = pytest.mark.django_db


def client_for(role, *, verified=False):
    user = User.objects.create_user(f"{role.lower()}@example.test", role=role, email_verified=verified)
    client = APIClient()
    client.force_authenticate(user)
    return client, user


@pytest.mark.parametrize("role", [User.Role.TOURIST, User.Role.COLLABORATOR])
def test_profile_can_only_edit_own_names(role):
    client, user = client_for(role)
    another = User.objects.create_user("another@example.test", first_name="Otro")
    response = client.get(PROFILE)
    assert response.status_code == 200
    assert response.data == {"first_name": "", "last_name": "", "complete": False}
    assert response["Cache-Control"] == "no-store"
    assert client.patch(PROFILE, {"first_name": "Ana"}, format="json").status_code == 400
    assert client.patch(PROFILE, {
        "first_name": "Ana", "last_name": "López", "id": another.pk,
    }, format="json").status_code == 400
    response = client.patch(PROFILE, {"first_name": " Ana ", "last_name": " López "}, format="json")
    assert response.status_code == 200
    assert response.data == {"first_name": "Ana", "last_name": "López", "complete": True}
    user.refresh_from_db()
    another.refresh_from_db()
    assert (user.first_name, user.last_name, user.email_verified) == ("Ana", "López", False)
    assert another.first_name == "Otro"


@pytest.mark.parametrize("role", [User.Role.ADMIN, User.Role.PROVIDER])
def test_profile_role_restrictions(role):
    client, _ = client_for(role, verified=True)
    assert client.get(PROFILE).status_code == 403
    assert client.patch(PROFILE, {"first_name": "Ana", "last_name": "López"}, format="json").status_code == 403


@pytest.mark.parametrize("role", [User.Role.ADMIN, User.Role.PROVIDER, User.Role.TOURIST])
def test_bank_rejects_other_roles(role):
    client, _ = client_for(role, verified=True)
    assert client.get(BANK).status_code == 403
    assert client.put(BANK, {"cbu": CBU}, format="json").status_code == 403


def test_bank_requires_active_verified_collaborator_for_writing():
    client, user = client_for(User.Role.COLLABORATOR)
    assert client.get(BANK).data == {"configured": False, "cbu_masked": None, "alias_masked": None}
    assert client.put(BANK, {"cbu": CBU}, format="json").status_code == 403
    User.objects.filter(pk=user.pk).update(is_active=False, email_verified=True)
    assert client.put(BANK, {"cbu": CBU}, format="json").status_code == 403


@override_settings(BANK_DETAILS_ENCRYPTION_KEY=KEY)
def test_bank_masks_encrypts_and_replaces_owned_values():
    from accounts.bank import locked_bank_version, reveal_bank_details
    from accounts.models import CollaboratorBankDetails

    client, user = client_for(User.Role.COLLABORATOR, verified=True)
    other = User.objects.create_user("other@example.test", role=User.Role.COLLABORATOR, email_verified=True)
    response = client.put(BANK, {"cbu": f" {CBU} ", "alias": " mi.alias "}, format="json")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.data == {"configured": True, "cbu_masked": "•••• 0056", "alias_masked": "••••"}
    assert client.get(BANK).data == response.data
    version = locked_bank_version(user.pk)
    row = CollaboratorBankDetails.objects.get(user=user)
    assert CBU.encode() not in bytes(row.ciphertext)
    assert b"mi.alias" not in bytes(row.ciphertext)
    assert reveal_bank_details(user.pk) == {"cbu": CBU, "alias": "mi.alias"}
    client.force_authenticate(other)
    assert client.get(BANK).data["configured"] is False
    assert reveal_bank_details(other.pk) is None
    client.force_authenticate(user)
    assert client.put(BANK, {"cbu": CBU, "alias": ""}, format="json").data["alias_masked"] is None
    assert locked_bank_version(user.pk) != version


@pytest.mark.parametrize(("field", "value"), [
    ("cbu", "0000001802051342910056"),
    ("cbu", "0000001702051342910057"),
    ("cbu", "００００００００００００００００００００００"),
    ("cbu", 1000000000000000000000),
    ("alias", "alias_1"),
    ("alias", "aliasé"),
    ("alias", "short"),
])
def test_bank_validation_rejects_invalid_values(field, value):
    client, _ = client_for(User.Role.COLLABORATOR, verified=True)
    response = client.put(BANK, {"cbu": CBU, "alias": "", field: value}, format="json")
    assert response.status_code == 400
    assert response["Cache-Control"] == "no-store"
    assert field in response.data


@override_settings(BANK_DETAILS_ENCRYPTION_KEY="")
def test_bank_fails_closed_without_key():
    client, _ = client_for(User.Role.COLLABORATOR, verified=True)
    response = client.put(BANK, {"cbu": CBU, "alias": "mi.alias"}, format="json")
    assert response.status_code == 503
    assert response["Cache-Control"] == "no-store"
    assert CBU not in response.content.decode()
    assert "mi.alias" not in response.content.decode()
    assert client.get(BANK).data["configured"] is False


@override_settings(BANK_DETAILS_ENCRYPTION_KEY=KEY)
def test_bank_version_requires_decryptable_record():
    from accounts.bank import BankDetailsUnavailable, locked_bank_version

    client, user = client_for(User.Role.COLLABORATOR, verified=True)
    assert client.put(BANK, {"cbu": CBU}, format="json").status_code == 200
    assert locked_bank_version(user.pk) is not None
    with override_settings(BANK_DETAILS_ENCRYPTION_KEY="A" * 43), pytest.raises(BankDetailsUnavailable):
        locked_bank_version(user.pk)
