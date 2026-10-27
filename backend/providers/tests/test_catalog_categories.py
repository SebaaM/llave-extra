from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from providers.models import Benefit, CatalogConfig, Provider, Publication


def add_provider(slug, category, *, status=Publication.PUBLISHED):
    return Provider.objects.create(slug=slug, name=slug, category=category, status=status)


def add_benefit(provider, title, *, status=Publication.PUBLISHED, valid_from=None, valid_until=None):
    return Benefit.objects.create(
        provider=provider,
        title=title,
        conditions="Condiciones",
        status=status,
        valid_from=valid_from,
        valid_until=valid_until,
    )


@pytest.mark.django_db
def test_categories_include_all_public_current_benefits_not_only_first_benefit_page():
    today = timezone.localdate()
    eligible = add_provider("eligible", "Comida")
    add_benefit(eligible, "Vigente", valid_from=today, valid_until=today)
    add_benefit(eligible, "También vigente")
    add_benefit(eligible, "Futuro", valid_from=today + timedelta(days=1))
    add_benefit(eligible, "Vencido", valid_until=today - timedelta(days=1))
    add_benefit(eligible, "Borrador", status=Publication.DRAFT)
    add_benefit(eligible, "Inactivo", status=Publication.INACTIVE)

    for slug, category, status, valid_from, valid_until in (
        ("future-only", "Solo futuro", Publication.PUBLISHED, today + timedelta(days=1), None),
        ("expired-only", "Solo vencido", Publication.PUBLISHED, None, today - timedelta(days=1)),
        ("draft-only", "Solo borrador", Publication.DRAFT, None, None),
        ("inactive-only", "Solo inactivo", Publication.INACTIVE, None, None),
    ):
        provider = add_provider(slug, category)
        add_benefit(provider, slug, status=status, valid_from=valid_from, valid_until=valid_until)

    hidden = add_provider("hidden", "Oculta", status=Publication.INACTIVE)
    add_benefit(hidden, "Prestador inactivo")
    draft_provider = add_provider("draft-provider", "Borrador proveedor", status=Publication.DRAFT)
    add_benefit(draft_provider, "Prestador borrador")

    for index in range(30):
        provider = add_provider(f"extra-{index:02d}", f"Categoría {index:02d}")
        add_benefit(provider, f"Extra {index:02d}")

    response = APIClient().get("/api/v1/catalog/categories/", {"page": 99, "search": "inexistente"})

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.data == {"results": [*(f"Categoría {index:02d}" for index in range(30)), "Comida"]}


@pytest.mark.django_db
def test_categories_deduplicate_exact_values_keep_case_variants_and_exclude_blanks():
    for index, value in enumerate(("comida", "Comida", "comida", "", "   ", "Arte", "arte")):
        provider = add_provider(f"provider-{index}", value)
        add_benefit(provider, f"Beneficio {index}")

    response = APIClient().get("/api/v1/catalog/categories/")

    assert response.status_code == 200
    assert response.data == {"results": ["Arte", "arte", "Comida", "comida"]}


@pytest.mark.django_db
def test_raw_category_values_remain_distinct_and_filter_their_own_benefits():
    plain_provider = add_provider("plain-food", "Comida")
    plain_benefit = add_benefit(plain_provider, "Plain lunch")
    spaced_provider = add_provider("spaced-food", " Comida ")
    spaced_benefit = add_benefit(spaced_provider, "Spaced lunch")
    client = APIClient()

    categories = client.get("/api/v1/catalog/categories/")
    plain = client.get("/api/v1/catalog/benefits/", {"category": "Comida"})
    spaced = client.get("/api/v1/catalog/benefits/", {"category": " Comida "})

    assert " Comida " in categories.data["results"]
    assert "Comida" in categories.data["results"]
    assert plain.data["count"] == 1
    assert plain.data["results"][0]["id"] == str(plain_benefit.pk)
    assert spaced.data["count"] == 1
    assert spaced.data["results"][0]["id"] == str(spaced_benefit.pk)
    assert client.get(
        "/api/v1/catalog/benefits/", {"category": " Comida ", "search": "plain"}
    ).data["count"] == 0


@pytest.mark.django_db
def test_trimmed_category_fallback_when_raw_category_is_absent_even_with_search():
    food = add_provider("food", "Comida")
    food_benefit = add_benefit(food, "Searchable lunch")
    drinks = add_provider("drinks", "Bebida")
    add_benefit(drinks, "Other lunch")
    client = APIClient()

    fallback = client.get("/api/v1/catalog/benefits/", {"category": "  Comida  ", "search": "searchable"})
    whitespace_only = client.get("/api/v1/catalog/benefits/", {"category": "   "})

    assert fallback.data["count"] == 1
    assert fallback.data["results"][0]["id"] == str(food_benefit.pk)
    assert whitespace_only.data["count"] == 2


@pytest.mark.django_db
def test_categories_are_empty_when_no_current_published_benefit_and_filter_values_are_usable():
    provider = add_provider("food", "Comida")
    benefit = add_benefit(provider, "Almuerzo")
    add_benefit(add_provider("other", "Otra"), "Fuera", status=Publication.DRAFT)
    client = APIClient()

    categories = client.get("/api/v1/catalog/categories/")
    filtered = client.get("/api/v1/catalog/benefits/", {"category": categories.data["results"][0]})

    assert categories.data == {"results": ["Comida"]}
    assert filtered.data["count"] == 1
    assert filtered.data["results"][0]["id"] == str(benefit.pk)

    benefit.status = Publication.DRAFT
    benefit.save(update_fields=["status"])
    assert client.get("/api/v1/catalog/categories/").data == {"results": []}


@pytest.mark.django_db
def test_disabled_catalog_returns_not_found_without_caching_and_is_read_only():
    CatalogConfig.objects.filter(singleton=1).update(enabled=False)
    client = APIClient()
    path = "/api/v1/catalog/categories/"

    response = client.get(path)
    assert response.status_code == 404
    assert response["Cache-Control"] == "no-store"
    assert client.post(path, {}).status_code == 405
    assert client.put(path, {}).status_code == 405
