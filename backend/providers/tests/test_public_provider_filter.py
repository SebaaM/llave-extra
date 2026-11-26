from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from providers.models import Benefit, CatalogConfig, Provider, Publication


@pytest.fixture
def provider_filter_catalog():
    today = timezone.localdate()
    provider = Provider.objects.create(
        slug="provider-filter",
        name="Prestador visible",
        category="Comida",
        status=Publication.PUBLISHED,
        provenance="https://private.test/provider",
    )
    benefits = [
        Benefit.objects.create(
            provider=provider,
            title=f"Almuerzo {index}",
            conditions="Con reserva",
            status=Publication.PUBLISHED,
            featured=True,
            valid_from=today,
            valid_until=today,
            provenance="https://private.test/benefit",
        )
        for index in (1, 2)
    ]
    nonpublic_provider = Provider.objects.create(
        slug="provider-filter-draft",
        name="Prestador borrador",
        status=Publication.DRAFT,
    )
    Benefit.objects.create(
        provider=nonpublic_provider,
        title="No público",
        conditions="Con reserva",
        status=Publication.PUBLISHED,
    )
    Benefit.objects.create(
        provider=provider,
        title="Oferta futura",
        conditions="Con reserva",
        status=Publication.PUBLISHED,
        valid_from=today + timedelta(days=1),
    )
    return provider, benefits, nonpublic_provider


@pytest.mark.django_db
def test_provider_uuid_filter_composes_with_existing_filters_and_pagination(provider_filter_catalog):
    provider, benefits, _ = provider_filter_catalog
    other_provider = Provider.objects.create(
        slug="provider-filter-other",
        name="Otro prestador",
        category="Comida",
        status=Publication.PUBLISHED,
    )
    Benefit.objects.create(
        provider=other_provider,
        title="Almuerzo externo",
        conditions="Con reserva",
        status=Publication.PUBLISHED,
        featured=True,
    )

    response = APIClient().get(
        "/api/v1/catalog/benefits/",
        {
            "provider": str(provider.pk),
            "category": "Comida",
            "search": "Almuerzo",
            "featured": "true",
            "page_size": 1,
        },
    )

    assert response.status_code == 200
    assert response.data["count"] == 2
    assert len(response.data["results"]) == 1
    assert response.data["results"][0]["id"] == str(benefits[0].pk)
    assert "provenance" not in str(response.data)
    next_page = APIClient().get(response.data["next"])
    assert next_page.status_code == 200
    assert next_page.data["count"] == 2
    assert next_page.data["results"][0]["id"] == str(benefits[1].pk)
    assert str(provider.pk) in response.data["next"]


@pytest.mark.django_db
def test_provider_filter_returns_empty_for_unknown_or_unpublished_provider(provider_filter_catalog):
    _, _, unpublished_provider = provider_filter_catalog
    client = APIClient()

    for provider_id in (str(unpublished_provider.pk), str(uuid4())):
        response = client.get("/api/v1/catalog/benefits/", {"provider": provider_id})
        assert response.status_code == 200
        assert response.data["count"] == 0
        assert response.data["results"] == []


@pytest.mark.django_db
@pytest.mark.parametrize("query", [
    "?provider=not-a-uuid",
    "?provider=00000000-0000-0000-0000-000000000001&provider=00000000-0000-0000-0000-000000000001",
])
def test_provider_filter_rejects_malformed_or_duplicate_values(query):
    response = APIClient().get(f"/api/v1/catalog/benefits/{query}")
    assert response.status_code == 400
    assert set(response.data) == {"provider"}


@pytest.mark.django_db
def test_provider_filter_does_not_bypass_disabled_catalog(provider_filter_catalog):
    config = CatalogConfig.objects.get(singleton=1)
    config.enabled = False
    config.save(update_fields=["enabled"])

    response = APIClient().get(
        "/api/v1/catalog/benefits/",
        {"provider": str(provider_filter_catalog[0].pk)},
    )
    assert response.status_code == 404


def test_provider_filter_is_documented_as_optional_uuid_parameter():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    parameters = schema["paths"]["/api/v1/catalog/benefits/"]["get"]["parameters"]
    provider = next(parameter for parameter in parameters if parameter["name"] == "provider")

    assert provider["in"] == "query"
    assert provider.get("required", False) is False
    assert provider["schema"] == {"type": "string", "format": "uuid"}
