import pytest
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from referrals.models import CollaboratorProfile


@pytest.mark.django_db
@pytest.mark.parametrize(("path", "parameter"), [
    ("/api/v1/collaborator/catalog/benefits/", "search"),
    ("/api/v1/collaborator/catalog/benefits/", "category"),
    ("/api/v1/admin/activity/", "search"),
    ("/api/v1/admin/activity/", "action"),
    ("/api/v1/admin/activity/", "resource"),
    ("/api/v1/admin/benefits/", "search"),
    ("/api/v1/admin/benefits/", "status"),
])
def test_private_views_reject_null_characters_in_text_filters(path, parameter):
    if path.startswith("/api/v1/admin/"):
        actor = User.objects.create_superuser("query-admin@example.test")
    else:
        actor = User.objects.create_user("query-collaborator@example.test", role=User.Role.COLLABORATOR)
        CollaboratorProfile.objects.create(user=actor, enabled=True)
    access, _ = issue_session(actor)
    client = APIClient(raise_request_exception=False)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = client.get(path, {parameter: "texto\x00inválido"})

    assert response.status_code == 400
    assert set(response.data) == {parameter}
