from datetime import timedelta
from io import BytesIO

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.test import RequestFactory
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from providers.admin import CatalogConfigAdmin
from providers.catalog import catalog_benefits
from providers.models import Benefit, CatalogConfig, Provider, Publication


def png():
    output = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(output, format="PNG")
    return ContentFile(output.getvalue(), name="test.png")


@pytest.fixture
def catalog():
    today = timezone.localdate()
    provider = Provider.objects.create(slug="published", name="Publicado", category="Comida", status=Publication.PUBLISHED, demo=True, provenance="https://private.test/source")
    provider.image.save("test.png", png())
    benefit = Benefit.objects.create(provider=provider, title="Almuerzo", conditions="Con reserva", valid_from=today, valid_until=today, status=Publication.PUBLISHED, demo=True, provenance="https://private.test/offer")
    benefit.image.save("test.png", png())
    future = Benefit.objects.create(provider=provider, title="Futuro", conditions="Sí", valid_from=today + timedelta(days=1), status=Publication.PUBLISHED)
    past = Benefit.objects.create(provider=provider, title="Pasado", conditions="Sí", valid_until=today - timedelta(days=1), status=Publication.PUBLISHED)
    draft = Benefit.objects.create(provider=provider, title="Borrador", conditions="Sí", status=Publication.DRAFT)
    hidden_provider = Provider.objects.create(slug="hidden", name="Oculto", status=Publication.DRAFT)
    hidden = Benefit.objects.create(provider=hidden_provider, title="Oculto", conditions="Sí", status=Publication.PUBLISHED)
    return provider, benefit, future, past, draft, hidden


@pytest.mark.django_db
def test_anonymous_public_policy_and_safe_dto(catalog):
    provider, benefit, future, past, draft, hidden = catalog
    client = APIClient()
    response = client.get("/api/v1/catalog/benefits/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == str(benefit.pk)
    item = response.data["results"][0]
    assert set(item) == {"id", "title", "description", "conditions", "valid_from", "valid_until", "demo", "image_url", "provider"}
    assert set(item["provider"]) == {"id", "slug", "name", "category", "description", "address", "hours", "contact", "map_url", "website", "demo", "image_url"}
    assert item["demo"] is True and item["provider"]["demo"] is True
    assert "provenance" not in str(item)
    assert client.get(f"/api/v1/catalog/benefits/{benefit.pk}/").status_code == 200
    for excluded in (future, past, draft, hidden):
        assert client.get(f"/api/v1/catalog/benefits/{excluded.pk}/").status_code == 404
    assert list(catalog_benefits().values_list("pk", flat=True)) == [benefit.pk]


@pytest.mark.django_db
def test_filters_pagination_and_read_only(catalog):
    provider, benefit, *_ = catalog
    Benefit.objects.bulk_create([
        Benefit(provider=provider, title=f"Extra {i:02d}", conditions="Sí", status=Publication.PUBLISHED)
        for i in range(50)
    ])
    client = APIClient()
    root = "/api/v1/catalog/benefits/"
    assert client.get(root).data["count"] == 51
    assert len(client.get(root).data["results"]) == 24
    assert len(client.get(root, {"page_size": 100}).data["results"]) == 48
    assert len(client.get(root, {"page": 2}).data["results"]) == 24
    assert client.get(root, {"search": "almuer", "category": "comida"}).data["count"] == 1
    assert client.get(root, {"category": "otra"}).data["count"] == 0
    assert client.post(root, {"title": "Intruso"}).status_code == 405
    assert client.patch(f"{root}{benefit.pk}/", {"title": "Intruso"}).status_code == 405
    assert client.put("/api/v1/catalog/config/", {"enabled": False}).status_code == 405


@pytest.mark.django_db
def test_toggle_blocks_direct_detail_and_public_media_but_private_routes_unchanged(catalog):
    provider, benefit, *_ = catalog
    client = APIClient()
    detail = f"/api/v1/catalog/benefits/{benefit.pk}/"
    provider_media = f"/api/v1/catalog/providers/{provider.pk}/media/"
    benefit_media = f"/api/v1/catalog/benefits/{benefit.pk}/media/"
    for path in (provider_media, benefit_media):
        response = client.get(path)
        assert response.status_code == 200
        assert response["Cache-Control"] == "no-store"
        assert response["X-Content-Type-Options"] == "nosniff"
    config = CatalogConfig.objects.get(singleton=1)
    config.enabled = False
    config.save(update_fields=["enabled"])
    assert client.get("/api/v1/catalog/config/").data == {"enabled": False}
    for path in ("/api/v1/catalog/benefits/", detail, provider_media, benefit_media):
        response = client.get(path)
        assert response.status_code == 404
        assert response["Cache-Control"] == "no-store"
    assert client.get(f"/api/v1/folders/{provider.pk}/providers/").status_code == 401


@pytest.mark.django_db
def test_media_rechecks_publication_and_dates(catalog):
    provider, benefit, *_ = catalog
    client = APIClient()
    provider_media = f"/api/v1/catalog/providers/{provider.pk}/media/"
    benefit_media = f"/api/v1/catalog/benefits/{benefit.pk}/media/"
    benefit.valid_from = None
    benefit.valid_until = timezone.localdate() - timedelta(days=1)
    benefit.save(update_fields=["valid_from", "valid_until"])
    assert client.get(benefit_media).status_code == 404
    assert client.get(provider_media).status_code == 404
    benefit.valid_until = None
    benefit.save(update_fields=["valid_until"])
    provider.status = Publication.INACTIVE
    provider.save(update_fields=["status"])
    assert client.get(benefit_media).status_code == 404
    assert client.get(provider_media).status_code == 404


@pytest.mark.django_db
def test_only_superuser_admin_can_manage_singleton():
    model_admin = CatalogConfigAdmin(CatalogConfig, AdminSite())
    request = RequestFactory().get("/admin/providers/catalogconfig/")
    for role, superuser in ((User.Role.TOURIST, False), (User.Role.PROVIDER, False), (User.Role.COLLABORATOR, False), (User.Role.ADMIN, False)):
        request.user = User.objects.create_user(f"{role}-{superuser}@example.test", "Secret-123", role=role, is_staff=True, is_superuser=superuser)
        assert not model_admin.has_module_permission(request)
        assert not model_admin.has_change_permission(request)
    request.user = User.objects.create_user("admin@example.test", "Secret-123", role=User.Role.ADMIN, is_staff=True, is_superuser=True)
    assert model_admin.has_change_permission(request)
    assert not model_admin.has_add_permission(request)
    assert not model_admin.has_delete_permission(request)
    with pytest.raises(IntegrityError), transaction.atomic():
        CatalogConfig.objects.create(singleton=2)
