import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from credits.models import Consumption, ProviderConsumptionCredential
from credits.services import (
    annul_consumption,
    award_consumption,
    set_provider_pin,
    sign_provider_qr,
)
from providers.models import Benefit, CatalogConfig, Provider, Publication


def authenticated(user):
    token, _ = issue_session(user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def history_domain():
    customer = User.objects.create_user("history@example.test", "Secret-123", email_verified=True)
    other_customer = User.objects.create_user("other-history@example.test", "Secret-123", email_verified=True)
    admin = User.objects.create_superuser("history-admin@example.test", "Secret-123")
    providers = [
        Provider.objects.create(slug=f"history-{i}", name=f"Prestador {i}", status=Publication.PUBLISHED)
        for i in range(4)
    ]
    tokens = []
    for i, provider in enumerate(providers):
        Benefit.objects.create(provider=provider, title=f"Oferta {i}", conditions="Con reserva",
                               status=Publication.PUBLISHED)
        pin = f"{i + 1:06d}"
        set_provider_pin(provider.pk, pin)
        credential = ProviderConsumptionCredential.objects.get(provider=provider)
        tokens.append((sign_provider_qr(credential), pin))
    return customer, other_customer, admin, providers, tokens


@pytest.mark.django_db
def test_history_shows_current_provider_name_without_changing_consumption(history_domain):
    customer, _, _, providers, tokens = history_domain
    record = award_consumption(customer, None, *tokens[0], "history-first")[0]
    consumption = Consumption.objects.get(pk=record["id"])
    original_created_at = consumption.created_at
    providers[0].name = "Nombre comercial actualizado"
    providers[0].save(update_fields=["name"])

    response = authenticated(customer).get("/api/v1/me/consumptions/")

    assert response.status_code == 200
    assert response.data[0]["provider_name"] == "Nombre comercial actualizado"
    assert set(response.data[0]) == {
        "id", "provider_id", "provider_name", "collaborator_id", "award", "state", "created_at"
    }
    consumption.refresh_from_db()
    assert consumption.created_at == original_created_at
    assert response["Cache-Control"] == "no-store"


@pytest.mark.django_db
def test_history_keeps_valid_and_annulled_hidden_provider_when_catalog_is_disabled(history_domain):
    customer, _, admin, providers, tokens = history_domain
    valid = award_consumption(customer, None, *tokens[0], "history-valid")[0]
    annulled = award_consumption(customer, None, *tokens[1], "history-annulled")[0]
    annul_consumption(annulled["id"], admin, "Anulación de prueba")
    providers[0].status = Publication.DRAFT
    providers[0].save(update_fields=["status"])
    CatalogConfig.objects.update_or_create(singleton=1, defaults={"enabled": False})

    response = authenticated(customer).get("/api/v1/me/consumptions/")

    assert response.status_code == 200
    assert {item["id"] for item in response.data} == {valid["id"], annulled["id"]}
    by_id = {item["id"]: item for item in response.data}
    assert by_id[valid["id"]]["state"] == Consumption.State.VALID
    assert by_id[valid["id"]]["provider_name"] == providers[0].name
    assert by_id[annulled["id"]]["state"] == Consumption.State.ANNULLED
    assert by_id[annulled["id"]]["provider_name"] == providers[1].name


@pytest.mark.django_db
def test_history_is_private_to_active_tourist_users(history_domain):
    customer, other_customer, _, _, tokens = history_domain
    award_consumption(customer, None, *tokens[0], "history-owned")[0]

    assert authenticated(customer).get("/api/v1/me/consumptions/").status_code == 200
    assert authenticated(other_customer).get("/api/v1/me/consumptions/").data == []
    assert APIClient().get("/api/v1/me/consumptions/").status_code == 401

    for role in (User.Role.COLLABORATOR, User.Role.PROVIDER, User.Role.ADMIN):
        user = User.objects.create_user(f"{role.lower()}-history@example.test", "Secret-123", role=role)
        assert authenticated(user).get("/api/v1/me/consumptions/").status_code == 403

    inactive_customer = User.objects.create_user("inactive-history@example.test", "Secret-123")
    inactive_client = authenticated(inactive_customer)
    inactive_customer.is_active = False
    inactive_customer.save(update_fields=["is_active"])
    assert inactive_client.get("/api/v1/me/consumptions/").status_code in (401, 403)


@pytest.mark.django_db
def test_history_query_count_does_not_grow_with_number_of_records(history_domain):
    customer, _, _, _, tokens = history_domain
    for index, credentials in enumerate(tokens[:2]):
        award_consumption(customer, None, *credentials, f"query-count-{index}")

    client = authenticated(customer)
    with CaptureQueriesContext(connection) as small_history:
        assert len(client.get("/api/v1/me/consumptions/").data) == 2

    for index, credentials in enumerate(tokens[2:], start=2):
        award_consumption(customer, None, *credentials, f"query-count-{index}")

    with CaptureQueriesContext(connection) as large_history:
        assert len(client.get("/api/v1/me/consumptions/").data) == 4

    assert len(large_history) == len(small_history)


@pytest.mark.django_db
def test_consumption_post_response_and_replay_keep_original_dto(history_domain):
    customer, _, _, _, tokens = history_domain
    client = authenticated(customer)
    qr_token, pin = tokens[0]
    payload = {"qr_token": qr_token, "pin": pin}

    first = client.post("/api/v1/consumptions/", payload, format="json", HTTP_IDEMPOTENCY_KEY="history-post")
    retry = client.post("/api/v1/consumptions/", payload, format="json", HTTP_IDEMPOTENCY_KEY="history-post")

    assert first.status_code == 201
    assert "provider_name" not in first.data
    assert retry.data == first.data
