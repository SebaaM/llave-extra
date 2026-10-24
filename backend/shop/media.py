import uuid
from pathlib import Path

from django.urls import reverse

from providers.media import PrivateStorage, validate_private_image


class ProductStorage(PrivateStorage):
    def url(self, name):
        return reverse("shop-admin-media", kwargs={"name": name})


def product_storage():
    return ProductStorage()


def product_image_path(instance, filename):
    return f"shop/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


__all__ = ["product_storage", "validate_private_image", "product_image_path"]
