import uuid
from datetime import UTC, datetime

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import Commission, CommissionEvent, CommissionState
from commissions.services import record_referral
from credits.models import Consumption
from providers.models import Provider
from referrals.models import CollaboratorProfile

pytestmark = pytest.mark.django_db


@pytest.fixture
def history():
    collaborator = User.objects.create_user("collaborator@example.test", role=User.Role.COLLABORATOR)
    other = User.objects.create_user("other@example.test", role=User.Role.COLLABORATOR)
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=False)
    other_profile = CollaboratorProfile.objects.create(user=other, enabled=True)
    provider = Provider.objects.create(name="Negocio de prueba", slug="negocio-prueba")

    def consume(owner, *, title, demo=False, with_commission=True):
        tourist = User.objects.create_user(
            f"tourist-{uuid.uuid4().hex}@example.test", email_verified=True,
        )
        item = Consumption.objects.create(
            tourist=tourist, provider=provider, collaborator=owner,
            benefit_id=uuid.uuid4() if title else None, benefit_title=title, benefit_demo=demo, award=0, rule_snapshot={},
        )
        if with_commission:
            record_referral(item)
        return item

    historical = consume(profile, title="", with_commission=False)
    pending = consume(profile, title="Oferta histórica", with_commission=False)
    consume(other_profile, title="Privado ajeno")
    commission = Commission.objects.create(consumption=pending, verified_rate="7.00", verified_source="BENEFIT")
    declared = CommissionEvent.objects.create(
        commission=commission, actor=collaborator, actor_name="Prestador", kind="DECLARED",
        created_at=datetime.now(UTC), outcome="CONSUMED", amount="100.00",
    )
    commission.declaration = declared
    commission.state = CommissionState.TO_PAY
    commission.save(update_fields=["declaration", "state"])
    approval = CommissionEvent.objects.create(
        commission=commission, actor=collaborator, actor_name="Administrador", kind="APPROVED",
        created_at=datetime.now(UTC), basis=declared, base_amount="100.00", rate="7.00", amount="7.00",
        rule_source="BENEFIT", currency="ARS", bank_version=uuid.uuid4(),
    )
    commission.approval = approval
    commission.save(update_fields=["approval"])
    payment = CommissionEvent.objects.create(
        commission=commission, actor=collaborator, actor_name="Prestador", kind="PAYMENT_REPORTED",
        created_at=datetime.now(UTC), basis=approval, date="2026-11-10", amount="7.00",
        reference="TRANSFERENCIA-1",
    )
    commission.payment = payment
    commission.save(update_fields=["payment"])
    api = APIClient()
    api.force_authenticate(collaborator)
    return api, pending, historical


def test_collaborator_history_is_scoped_and_contains_only_read_fields(history):
    api, pending, historical = history
    response = api.get("/api/v1/collaborator/commissions/?page_size=1")
    assert response.status_code == 200, response.data
    assert response.data["count"] == 2
    assert response.data["pending_total"] == "7.00"
    first = response.data["results"][0]
    assert first == {
        "id": str(pending.pk), "created_at": first["created_at"], "provider_name": "Negocio de prueba",
        "benefit_title": "Oferta histórica", "state": "TO_PAY", "rate": "7.00",
        "approved_amount": "7.00", "payment_reported": True,
    }
    assert "cliente" not in str(response.data).lower()
    next_page = api.get("/api/v1/collaborator/commissions/?page=2&page_size=1")
    assert next_page.status_code == 200
    assert next_page.data["results"][0]["id"] == str(historical.pk)
    assert next_page.data["results"][0]["state"] == "HISTORICAL"
    assert next_page.data["results"][0]["rate"] is None
    assert next_page.data["pending_total"] == "7.00"


def test_non_collaborator_cannot_read_collaborator_history(history):
    api, _, _ = history
    provider = User.objects.create_user("provider@example.test", role=User.Role.PROVIDER)
    api.force_authenticate(provider)
    assert api.get("/api/v1/collaborator/commissions/").status_code == 403
