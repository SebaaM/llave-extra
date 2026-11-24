import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
@pytest.mark.parametrize(("path", "parameter"), [
    ("/api/v1/catalog/benefits/", "search"),
    ("/api/v1/catalog/benefits/", "category"),
    ("/api/v1/shop/products/", "search"),
])
def test_public_catalogs_reject_null_character_in_text_filter(path, parameter):
    response = APIClient().get(path, {parameter: "Texto\x00inválido"})
    assert response.status_code == 400
    assert set(response.data) == {parameter}
