from io import BytesIO

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.test import RequestFactory
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from providers.admin import CatalogConfigAdmin
from providers.models import Benefit, CatalogConfig, FolderProvider, Provider, Publication
from referrals.models import CollaboratorProfile, FolderAccess


def png():
    output = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(output, format="PNG")
    return ContentFile(output.getvalue(), name="network.png")


def published_provider(slug, name, titles=("Oferta",)):
    provider = Provider.objects.create(slug=slug, name=name, status=Publication.PUBLISHED)
    for title in titles:
        Benefit.objects.create(provider=provider, title=title, conditions="Condiciones", status=Publication.PUBLISHED)
    return provider


@pytest.mark.django_db
def test_public_network_pages_unique_providers_and_selects_stable_benefit():
    config = CatalogConfig.objects.get(singleton=1)
    config.network_page_size = 10
    config.save(update_fields=["network_page_size"])
    providers = [published_provider(f"network-{i:02}", f"Proveedor {i:02}", ("Zeta", "Alfa")) for i in range(30)]
    client = APIClient()

    page1 = client.get("/api/v1/catalog/network/")
    page2 = client.get("/api/v1/catalog/network/", {"page": 2})

    assert page1.status_code == page2.status_code == 200
    assert page1.data["count"] == 30 and len(page1.data["results"]) == 10
    assert len(page2.data["results"]) == 10
    assert {x["provider"]["id"] for x in page1.data["results"]}.isdisjoint({x["provider"]["id"] for x in page2.data["results"]})
    assert page1.data["results"][0]["benefit_title"] == "Alfa"
    assert page1.data["results"][0]["benefit_id"] == providers[0].benefits.get(title="Alfa").pk
    assert page1.data["presentation"] == {
        "title": "Red Llave Extra", "layout": "RADIAL", "theme": "SAND", "background": "HARBOR",
        "page_size": 10, "interval_seconds": 10, "city": "Ushuaia",
    }
    assert page1.data["next"]
    assert set(page1.data["results"][0]) == {"provider", "benefit_id", "benefit_title"}
    assert "provenance" not in str(page1.data)
    assert APIClient().get("/api/v1/catalog/network/", {"page_size": 1}).status_code == 400


@pytest.mark.django_db
def test_network_folder_is_independent_private_and_revalidates_each_page():
    config = CatalogConfig.objects.get(singleton=1)
    config.network_title = "Pública"
    config.save(update_fields=["network_title"])
    tourist = User.objects.create_user("network-tourist@example.test", "Secret-123")
    collaborator = User.objects.create_user("network-collab@example.test", "Secret-123", role=User.Role.COLLABORATOR)
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True, network_title="Recomendaciones", network_layout="ORBIT", network_theme="OCEAN", network_background="BEAGLE", network_page_size=10, network_interval_seconds=16)
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=profile.qr_version)
    client = APIClient()
    client.force_authenticate(tourist)
    providers = [published_provider(f"folder-network-{i:02}", f"Local {i:02}") for i in range(11)]
    for provider in providers:
        FolderProvider.assign(profile.pk, provider.pk)
    providers[0].image.save("private.png", png())

    root = f"/api/v1/folders/{profile.pk}/network/"
    page1 = client.get(root)
    assert page1.status_code == 200 and page1.data["count"] == 11
    assert page1.data["presentation"] == {"title": "Recomendaciones", "layout": "ORBIT", "theme": "OCEAN", "background": "BEAGLE", "page_size": 10, "interval_seconds": 16, "city": "Ushuaia"}
    assert "folders/" in page1.data["results"][0]["provider"]["image_url"]
    assert "provenance" not in str(page1.data)
    assert client.get(root, {"page": 2}).status_code == 200

    config.enabled = False
    config.save(update_fields=["enabled"])
    assert APIClient().get("/api/v1/catalog/network/").status_code == 404
    assert client.get(root).status_code == 200

    FolderAccess.objects.filter(tourist=tourist, collaborator=profile).delete()
    assert client.get(root, {"page": 2}).status_code == 404
    anonymous = APIClient().get(root).status_code
    assert anonymous == 401


@pytest.mark.django_db
def test_network_config_constraints_and_admin_roles():
    config = CatalogConfig.objects.get(singleton=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        CatalogConfig.objects.filter(pk=1).update(network_page_size=9)
    profile_owner = User.objects.create_user("profile-owner@example.test", "Secret-123", role=User.Role.COLLABORATOR)
    profile = CollaboratorProfile.objects.create(user=profile_owner)
    with pytest.raises(IntegrityError), transaction.atomic():
        CollaboratorProfile.objects.filter(pk=profile.pk).update(network_interval_seconds=61)

    model_admin = CatalogConfigAdmin(CatalogConfig, AdminSite())
    request = RequestFactory().get("/admin/providers/catalogconfig/")
    for role in (User.Role.TOURIST, User.Role.PROVIDER, User.Role.COLLABORATOR):
        request.user = User.objects.create_user(f"{role.lower()}-network@example.test", "Secret-123", role=role, is_staff=True)
        assert not model_admin.has_change_permission(request)
    request.user = User.objects.create_user("admin-network@example.test", "Secret-123", role=User.Role.ADMIN, is_staff=True, is_superuser=True)
    assert model_admin.has_change_permission(request)
    assert not model_admin.has_add_permission(request)
    assert config.network_title == "Red Llave Extra"
