import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.urls import reverse
from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_SIDE = 4096
FORMATS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}


class PrivateStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(location=settings.PRIVATE_MEDIA_ROOT, base_url="/")

    def url(self, name):
        return reverse("admin-private-media", kwargs={"name": name})


def private_storage():
    return PrivateStorage()


def private_image_path(instance, filename):
    return f"providers/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


def validate_private_image(upload):
    if upload.size > MAX_IMAGE_BYTES:
        raise ValidationError("La imagen supera 5 MB")
    try:
        upload.seek(0)
        with Image.open(upload) as image:
            image.verify()
        upload.seek(0)
        with Image.open(upload) as image:
            if image.format not in FORMATS or max(image.size) > MAX_IMAGE_SIDE:
                raise ValidationError("Imagen inválida o demasiado grande")
            expected = FORMATS[image.format]
            image.load()
        if Path(upload.name).suffix.lower() not in ({expected, ".jpeg"} if expected == ".jpg" else {expected}):
            raise ValidationError("La extensión no coincide con la imagen")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationError("Imagen inválida") from exc
    finally:
        upload.seek(0)
