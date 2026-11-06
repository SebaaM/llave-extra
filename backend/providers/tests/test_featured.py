from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from django.contrib.admin.sites import AdminSite
from django.db import IntegrityError, connections
from django.test import RequestFactory
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from accounts.models import User
from administration.models import AdminAudit
from providers.admin import BenefitAdmin
from providers.models import Benefit, CatalogConfig, Provider, ProviderMembership, Publication


@pytest.fixture
def featured_domain():
    provider = Provider.objects.create(slug="featured", name="Negocio", status=Publication.PUBLISHED)
    benefit = Benefit.objects.create(provider=provider, title="Oferta", conditions="Con reserva", status=Publication.PUBLISHED)
    admin = User.objects.create_superuser("featured-admin@example.test", "password")
    client = APIClient()
    client.force_authenticate(admin)
    return provider, benefit, admin, client


@pytest.mark.django_db
def test_featured_defaults_to_false_and_admin_can_create_explicit_featured(featured_domain):
    provider, benefit, _, client = featured_domain
    assert benefit.featured is False
    url = "/api/v1/admin/benefits/"
    for payload, expected in (({}, False), ({"featured": True}, True)):
        response = client.post(url, {"provider": str(provider.pk), "title": "Nueva", **payload}, format="json")
        assert response.status_code == 201
        assert response.data["featured"] is expected
        created = Benefit.objects.get(pk=response.data["id"])
        assert created.featured is expected
        assert created.status == Publication.DRAFT


@pytest.mark.django_db
def test_admin_featured_patch_requires_current_version_and_audits_once(featured_domain):
    _, benefit, _, client = featured_domain
    url = f"/api/v1/admin/benefits/{benefit.pk}/"
    original = client.get(url).data
    assert original["featured"] is False
    assert client.patch(url, {"featured": True}, format="json").status_code == 409
    response = client.patch(url, {"featured": True, "version": original["version"]}, format="json")
    assert response.status_code == 200
    assert response.data["featured"] is True
    assert response.data["version"] != original["version"]
    benefit.refresh_from_db()
    assert benefit.featured and benefit.status == Publication.PUBLISHED
    audit = AdminAudit.objects.get(resource="benefits", object_id=str(benefit.pk))
    assert audit.action == "benefits.update" and audit.changed_fields == ["featured"]
    assert client.patch(url, {"featured": True, "version": original["version"]}, format="json").status_code == 409
    retry = client.patch(url, {"featured": True, "version": response.data["version"]}, format="json")
    assert retry.status_code == 200 and retry.data == response.data
    assert AdminAudit.objects.filter(resource="benefits", object_id=str(benefit.pk)).count() == 1
    # External administrative edits are also included in the concrete-field digest.
    Benefit.objects.filter(pk=benefit.pk).update(featured=False)
    assert client.patch(url, {"featured": True, "version": response.data["version"]}, format="json").status_code == 409


@pytest.mark.django_db
def test_admin_can_list_replace_and_never_add_a_sixth_featured_benefit(featured_domain):
    provider, benefit, _, client = featured_domain
    Benefit.objects.bulk_create([
        Benefit(provider=provider, title=f"Oferta {index}", featured=True)
        for index in range(5)
    ])
    url = "/api/v1/admin/benefits/"
    detail = f"{url}{benefit.pk}/"
    selection = client.get(url, {"featured": "true"}).data
    assert selection["count"] == 5
    assert client.get(url).data["count"] == 6
    assert client.get(url, {"featured": "false"}).data["count"] == 1
    assert client.get(url, {"featured": "invalid"}).status_code == 400

    payload = {"featured": True, "version": client.get(detail).data["version"]}
    rejected = client.patch(detail, payload, format="json")
    assert rejected.status_code == 409
    assert "cinco beneficios destacados" in rejected.data["detail"]
    rejected_create = client.post(url, {"provider": str(provider.pk), "title": "Nueva", "featured": True}, format="json")
    assert rejected_create.status_code == 409
    assert "cinco beneficios destacados" in rejected_create.data["detail"]
    assert not AdminAudit.objects.exists()

    remove = selection["results"][0]
    assert client.patch(f'{url}{remove["id"]}/', {"featured": False, "version": remove["version"]}, format="json").status_code == 200
    assert client.patch(detail, payload, format="json").status_code == 200
    assert client.get(url, {"featured": "true"}).data["count"] == 5
    assert AdminAudit.objects.count() == 2


@pytest.mark.django_db(transaction=True)
def test_concurrent_selections_compete_for_the_last_featured_slot():
    provider = Provider.objects.create(slug="slots", name="Negocio")
    Benefit.objects.bulk_create([
        Benefit(provider=provider, title=f"Destacada {index}", featured=True)
        for index in range(4)
    ])
    candidates = Benefit.objects.bulk_create([
        Benefit(provider=provider, title=f"Candidata {index}") for index in range(2)
    ])
    ready = Barrier(2)

    def select(benefit):
        try:
            ready.wait(timeout=10)
            Benefit.objects.filter(pk=benefit.pk).update(featured=True)
            return "selected"
        except IntegrityError as error:
            return error.__cause__.diag.constraint_name
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(select, candidates)) == ["benefit_featured_slots_exhausted", "selected"]
    assert Benefit.objects.filter(featured=True).count() == 5


@pytest.mark.django_db
def test_provider_cannot_write_featured_on_own_benefit_or_admin_api(featured_domain):
    provider, benefit, _, admin_client = featured_domain
    owner = User.objects.create_user("featured-owner@example.test", "password", role=User.Role.PROVIDER)
    ProviderMembership.objects.create(user=owner, provider=provider)
    client = APIClient()
    client.force_authenticate(owner)
    own_url = f"/api/v1/provider/providers/{provider.pk}/benefits/"
    assert client.patch(f"{own_url}{benefit.pk}/", {"featured": True}, format="json").status_code == 400
    assert client.post(own_url, {"title": "Otra", "featured": True}, format="json").status_code == 400
    admin_url = f"/api/v1/admin/benefits/{benefit.pk}/"
    version = admin_client.get(admin_url).data["version"]
    assert client.patch(admin_url, {"featured": True, "version": version}, format="json").status_code == 403
    benefit.refresh_from_db()
    assert benefit.featured is False
    assert Benefit.objects.count() == 1 and not AdminAudit.objects.exists()
    assert "featured" not in client.get(f"{own_url}{benefit.pk}/").data


@pytest.mark.django_db
@pytest.mark.parametrize("flags", [
    {"role": "ADMIN", "is_staff": False, "is_superuser": True},
    {"role": "ADMIN", "is_staff": True, "is_superuser": False},
    {"role": "ADMIN", "is_staff": True, "is_superuser": True, "is_active": False},
    {"role": "COLLABORATOR", "is_staff": True, "is_superuser": False},
    {"role": "TOURIST", "is_staff": True, "is_superuser": False},
])
def test_only_active_staff_superuser_admin_can_feature(featured_domain, flags):
    _, benefit, _, _ = featured_domain
    outsider = User.objects.create_user("featured-outsider@example.test", "password", **flags)
    client = APIClient()
    client.force_authenticate(outsider)
    assert client.patch(f"/api/v1/admin/benefits/{benefit.pk}/", {"featured": True}, format="json").status_code == 403


@pytest.mark.django_db
def test_django_admin_exposes_featured_field_and_filter(featured_domain):
    _, benefit, admin, _ = featured_domain
    model_admin = BenefitAdmin(Benefit, AdminSite())
    request = RequestFactory().get("/admin/providers/benefit/")
    request.user = admin
    assert model_admin.has_change_permission(request, benefit)
    assert "featured" in model_admin.list_display and "featured" in model_admin.list_filter
    assert "featured" in model_admin.get_readonly_fields(request, benefit)
    assert "featured" not in model_admin.get_form(request, benefit).base_fields
    assert Benefit._meta.get_field("featured").verbose_name == "Destacado en el inicio"


@pytest.mark.django_db
def test_public_featured_filter_keeps_complete_catalog_and_paginates_stably(featured_domain):
    provider, ordinary, _, _ = featured_domain
    offers = Benefit.objects.bulk_create([
        Benefit(provider=provider, title=f"Destacada {index:02d}", conditions="Sí", status=Publication.PUBLISHED, featured=True)
        for index in range(5)
    ])
    client = APIClient()
    url = "/api/v1/catalog/benefits/"
    assert client.get(url).data["count"] == 6
    not_featured = client.get(url, {"featured": "false"})
    assert not_featured.status_code == 200 and not_featured.data["count"] == 1
    assert not_featured.data["results"][0]["id"] == str(ordinary.pk)
    first = client.get(url, {"featured": "true", "page_size": 3})
    second = client.get(first.data["next"])
    assert first.status_code == second.status_code == 200
    assert first.data["count"] == second.data["count"] == 5
    assert len(first.data["results"]) == 3 and len(second.data["results"]) == 2
    assert second.data["next"] is None
    assert [row["id"] for row in first.data["results"] + second.data["results"]] == [str(offer.pk) for offer in offers]
    assert "featured=true" in first.data["next"]
    assert "featured" not in first.data["results"][0]
    assert client.get(url, {"featured": "true", "search": "04"}).data["count"] == 1


@pytest.mark.django_db
def test_featured_filter_preserves_exact_category_whitespace_policy(featured_domain):
    provider, benefit, _, _ = featured_domain
    provider.category = " Comida "
    provider.save(update_fields=["category"])
    another = Provider.objects.create(slug="featured-category", name="Otro", category="Comida", status=Publication.PUBLISHED)
    Benefit.objects.create(provider=another, title="Destacado", conditions="Sí", status=Publication.PUBLISHED, featured=True)
    client = APIClient()
    url = "/api/v1/catalog/benefits/"
    assert client.get(url, {"category": " Comida ", "featured": "true"}).data["count"] == 0
    exact = client.get(url, {"category": " Comida ", "featured": "false"})
    assert [row["id"] for row in exact.data["results"]] == [str(benefit.pk)]
    assert client.get(url, {"category": " comida", "featured": "true"}).data["count"] == 1


@pytest.mark.django_db
def test_featured_never_bypasses_publication_validity_or_catalog_switch(featured_domain):
    provider, benefit, _, _ = featured_domain
    today = timezone.localdate()
    benefit.featured = True
    benefit.valid_from = benefit.valid_until = today
    benefit.save()
    hidden = Provider.objects.create(slug="featured-hidden", name="Oculto", status=Publication.DRAFT)
    client = APIClient()
    url = "/api/v1/catalog/benefits/"
    for overrides in (
        {"status": Publication.DRAFT}, {"status": Publication.INACTIVE}, {"provider": hidden},
        {"valid_from": today + timedelta(days=1)}, {"valid_until": today - timedelta(days=1)},
    ):
        unavailable = Benefit.objects.create(**{"provider": provider, "title": "No elegible", "conditions": "Sí",
                                               "status": Publication.PUBLISHED, "featured": True, **overrides})
        assert client.get(url, {"featured": "true"}).data["count"] == 1
        unavailable.delete()
    benefit.featured = False
    benefit.save(update_fields=["featured"])
    assert client.get(url, {"featured": "true"}).data["count"] == 0
    assert client.get(f"{url}{benefit.pk}/").status_code == 200
    CatalogConfig.objects.filter(pk=1).update(enabled=False)
    assert client.get(url, {"featured": "true"}).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("value", ["", "1", "0", "True", "FALSE", "yes", " true "])
def test_featured_filter_rejects_non_literal_booleans(value):
    response = APIClient().get("/api/v1/catalog/benefits/", {"featured": value})
    assert response.status_code == 400
    assert set(response.data) == {"featured"}


def test_featured_openapi_is_optional_public_filter_and_admin_only_attribute():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    parameters = schema["paths"]["/api/v1/catalog/benefits/"]["get"]["parameters"]
    featured = next(row for row in parameters if row["name"] == "featured")
    assert featured["schema"]["type"] == "boolean" and not featured.get("required", False)
    admin_parameters = schema["paths"]["/api/v1/admin/benefits/"]["get"]["parameters"]
    assert next(row for row in admin_parameters if row["name"] == "featured")["schema"]["type"] == "boolean"
    components = schema["components"]["schemas"]
    for name in ("AdminBenefitRead", "AdminBenefitWrite", "PatchedAdminBenefitPatchRequest"):
        assert components[name]["properties"]["featured"]["type"] == "boolean"
    for name in ("PublicBenefit", "BenefitRead", "BenefitWrite"):
        assert "featured" not in components[name]["properties"]
