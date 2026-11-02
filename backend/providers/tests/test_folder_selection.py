from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from providers.models import Benefit, CatalogConfig, FolderBenefit, Provider, Publication
from providers.tests.test_network import png
from referrals.access import active_folder_access
from referrals.models import CollaboratorProfile, FolderAccess


@pytest.fixture
def selection():
    owner = User.objects.create_user("selection-owner@example.test", role=User.Role.COLLABORATOR,
                                     first_name="Ana", last_name="Pérez")
    profile = CollaboratorProfile.objects.create(user=owner, enabled=True)
    tourist = User.objects.create_user("selection-client@example.test")
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=1)
    provider = Provider.objects.create(slug="selection", name="Alfa", status=Publication.PUBLISHED)
    benefit = Benefit.objects.create(provider=provider, title="Oferta", conditions="Condiciones", status=Publication.PUBLISHED)
    FolderBenefit.assign(profile.pk, benefit.pk)
    client = APIClient()
    client.force_authenticate(tourist)
    return client, tourist, profile, provider, benefit


def url(profile):
    return f"/api/v1/folders/{profile.pk}/benefits/"


@pytest.mark.django_db
def test_selection_pages_benefits_not_businesses_and_embeds_private_dtos(selection, django_assert_num_queries):
    client, _, profile, provider, benefit = selection
    provider.image.save("selection.png", png())
    benefit.image.save("selection.png", png())
    for index in range(24):
        other = Benefit.objects.create(provider=provider, title=f"Zeta {index:02}", conditions="Condiciones", status=Publication.PUBLISHED)
        FolderBenefit.assign(profile.pk, other.pk)
    # A later offer from the same business is never inherited.
    Benefit.objects.create(provider=provider, title="No elegida", conditions="Condiciones", status=Publication.PUBLISHED)
    with django_assert_num_queries(5):
        first = client.get(url(profile))
    assert first.status_code == 200
    assert first.data["count"] == 25 and len(first.data["results"]) == 24
    assert first.data["collaborator"] == {"id": str(profile.pk), "name": "Ana Pérez"}
    assert first.data["next"] and first.data["previous"] is None
    item = first.data["results"][0]
    assert item["id"] == str(benefit.pk)
    assert set(item) == {"id", "title", "description", "conditions", "valid_from", "valid_until", "image_url", "status", "demo", "provider"}
    assert item["provider"]["id"] == str(provider.pk)
    assert item["image_url"] == f"/api/v1/folders/{profile.pk}/providers/{provider.pk}/benefits/{benefit.pk}/media/"
    assert item["provider"]["image_url"] == f"/api/v1/folders/{profile.pk}/providers/{provider.pk}/media/"
    assert "provenance" not in str(first.data) and "example.test" not in str(first.data)
    second = client.get(url(profile), {"page": 2})
    assert second.status_code == 200 and len(second.data["results"]) == 1
    assert second.data["previous"] and second.data["next"] is None
    assert set(row["id"] for row in first.data["results"]).isdisjoint(row["id"] for row in second.data["results"])
    assert len(client.get(url(profile), {"page_size": 1}).data["results"]) == 1
    assert len(client.get(url(profile), {"page_size": 100}).data["results"]) == 25
    config = CatalogConfig.objects.get(singleton=1)
    config.enabled = False
    config.save(update_fields=["enabled"])
    assert client.get(url(profile)).status_code == 200
    assert client.get(item["image_url"]).status_code == 200
    FolderBenefit.remove(profile.pk, benefit.pk)
    assert client.get(item["image_url"]).status_code == 404
    assert client.get(url(profile)).data["count"] == 24


@pytest.mark.django_db
def test_selection_caps_page_size_at_48_and_orders_provider_title_pk(selection):
    client, _, profile, provider, benefit = selection
    Benefit.objects.filter(pk=benefit.pk).update(title="Zeta")
    for _index in range(50):
        other = Benefit.objects.create(provider=provider, title="Alfa", conditions="Condiciones", status=Publication.PUBLISHED)
        FolderBenefit.assign(profile.pk, other.pk)
    last_provider = Provider.objects.create(slug="zeta", name="Zeta", status=Publication.PUBLISHED)
    last = Benefit.objects.create(provider=last_provider, title="Primera", conditions="Condiciones", status=Publication.PUBLISHED)
    FolderBenefit.assign(profile.pk, last.pk)
    response = client.get(url(profile), {"page_size": 100})
    assert response.status_code == 200 and len(response.data["results"]) == 48
    expected = Benefit.objects.filter(folder_selections__collaborator=profile).order_by("provider__name", "title", "pk")
    assert [row["id"] for row in response.data["results"]] == [str(pk) for pk in expected.values_list("pk", flat=True)[:48]]


@pytest.mark.django_db
def test_selection_only_current_selected_published_benefits(selection):
    client, _, profile, provider, benefit = selection
    today = timezone.localdate()
    for title, kwargs in (
        ("Borrador", {"status": Publication.DRAFT}),
        ("Vencida", {"valid_until": today - timedelta(days=1)}),
        ("Futura", {"valid_from": today + timedelta(days=1)}),
    ):
        other = Benefit.objects.create(provider=provider, title=title, conditions="Condiciones", **({"status": Publication.PUBLISHED} | kwargs))
        FolderBenefit.objects.create(collaborator=profile, benefit=other)
    unselected = Provider.objects.create(slug="unselected", name="Sin elegir", status=Publication.PUBLISHED)
    Benefit.objects.create(provider=unselected, title="Oferta ajena", conditions="Condiciones", status=Publication.PUBLISHED)
    assert [row["id"] for row in client.get(url(profile)).data["results"]] == [str(benefit.pk)]
    Provider.objects.filter(pk=provider.pk).update(status=Publication.DRAFT)
    assert client.get(url(profile)).data["results"] == []


@pytest.mark.django_db
@pytest.mark.parametrize("change", ["rotate", "disabled", "owner-inactive", "owner-role", "client-inactive", "client-role", "removed-grant"])
def test_selection_revalidates_current_access_and_private_media(selection, change):
    client, tourist, profile, provider, benefit = selection
    provider.image.save("selection.png", png())
    benefit.image.save("selection.png", png())
    data = client.get(url(profile)).data
    media = [data["results"][0]["image_url"], data["results"][0]["provider"]["image_url"]]
    if change == "rotate":
        CollaboratorProfile.rotate(profile.pk)
    elif change == "disabled":
        CollaboratorProfile.set_enabled(profile.pk, False)
    elif change.startswith("owner-"):
        User.objects.filter(pk=profile.user_id).update(**({"is_active": False} if change == "owner-inactive" else {"role": User.Role.PROVIDER}))
    elif change.startswith("client-"):
        User.objects.filter(pk=tourist.pk).update(**({"is_active": False} if change == "client-inactive" else {"role": User.Role.PROVIDER}))
    else:
        FolderAccess.objects.filter(tourist=tourist, collaborator=profile).delete()
    for path in [url(profile), *media]:
        response = client.get(path)
        assert response.status_code == 404
        assert "no-store" in response["Cache-Control"] and response["Referrer-Policy"] == "no-referrer"


@pytest.mark.django_db
@pytest.mark.parametrize("role", [None, User.Role.TOURIST, User.Role.PROVIDER, User.Role.COLLABORATOR, User.Role.ADMIN])
def test_selection_rejects_anonymous_other_clients_and_roles(selection, role):
    _, _, profile, _, _ = selection
    client = APIClient()
    if role is not None:
        user = User.objects.create_user("other-selection@example.test", role=role)
        # Even a historical row does not confer TOURIST privileges to other roles.
        if role != User.Role.TOURIST:
            FolderAccess.objects.create(tourist=user, collaborator=profile, qr_version=1)
        client.force_authenticate(user)
    response = client.get(url(profile))
    assert response.status_code == (401 if role is None else 404)
    assert "no-store" in response["Cache-Control"]


@pytest.mark.django_db
def test_selection_rechecks_access_before_response_and_rejects_extra_filters(selection):
    client, tourist, profile, _, _ = selection
    with patch("providers.folder_selection.active_folder_access", return_value=False):
        assert client.get(url(profile)).status_code == 404
    assert active_folder_access(tourist, profile)
    assert client.get(url(profile), {"category": "Café"}).status_code == 400
