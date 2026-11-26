import hashlib
import json
from pathlib import Path

import django
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image

django.setup()

from accounts.models import User  # noqa: E402
from providers.models import Benefit, CatalogConfig, FolderBenefit, Publication  # noqa: E402
from referrals.access import active_folder_access, redeem_qr, sign_qr  # noqa: E402


def create_png() -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    Image.new("RGB", (2, 2), (25, 80, 145)).save(buffer, format="PNG")
    return buffer.getvalue()


def main() -> None:
    if settings.DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
        raise RuntimeError("T7_FIXTURE_REQUIRES_POSTGRESQL")
    if settings.SHOP_PAYMENT_PROVIDER != "disabled":
        raise RuntimeError("T7_FIXTURE_REQUIRES_DISABLED_PAYMENTS")
    if not CatalogConfig.objects.filter(singleton=1, enabled=True).exists():
        raise RuntimeError("T7_FIXTURE_REQUIRES_PUBLIC_CATALOG_ENABLED")

    selection = (
        FolderBenefit.objects.select_related(
            "benefit", "benefit__provider", "collaborator", "collaborator__user"
        )
        .filter(
            collaborator__enabled=True,
            collaborator__user__is_active=True,
            benefit__demo=True,
            benefit__provider__demo=True,
            benefit__status=Publication.PUBLISHED,
            benefit__provider__status=Publication.PUBLISHED,
        )
        .order_by("pk")
        .first()
    )
    if selection is None or selection.benefit.image:
        raise RuntimeError("T7_FIXTURE_NO_EMPTY_PUBLISHED_SELECTED_BENEFIT")

    tourist = (
        User.objects.filter(
            email__startswith="activity.cliente.",
            is_active=True,
            email_verified=True,
            role=User.Role.TOURIST,
        )
        .order_by("email")
        .first()
    )
    if tourist is None:
        raise RuntimeError("T7_FIXTURE_TOURIST_NOT_LOGIN_ELIGIBLE")

    profile = selection.collaborator
    if not active_folder_access(tourist, profile):
        redeem_qr(tourist, sign_qr(profile))
    if not active_folder_access(tourist, profile):
        raise RuntimeError("T7_FIXTURE_FOLDER_ACCESS_NOT_ACTIVE")

    benefit = selection.benefit
    benefit.image.save("e6-t7-synthetic.png", ContentFile(create_png()), save=True)
    with benefit.image.open("rb") as image_file:
        image_digest = hashlib.sha256(image_file.read()).hexdigest()

    public_marker = Path(settings.MEDIA_ROOT) / "e6-t7-volume-marker.txt"
    if public_marker.exists():
        raise RuntimeError("T7_PUBLIC_VOLUME_MARKER_ALREADY_EXISTS")
    public_marker.write_bytes(b"E6 T7 synthetic public-volume integrity marker\n")
    marker_digest = hashlib.sha256(public_marker.read_bytes()).hexdigest()

    fixture = {
        "folder_id": str(profile.pk),
        "provider_id": str(benefit.provider_id),
        "benefit_id": str(benefit.pk),
        "public_catalog_path": f"/api/v1/catalog/benefits/{benefit.pk}/media/",
        "private_folder_path": (
            f"/api/v1/folders/{profile.pk}/providers/{benefit.provider_id}/"
            f"benefits/{benefit.pk}/media/"
        ),
        "private_media_sha256": image_digest,
        "public_volume_marker": public_marker.name,
        "public_volume_marker_sha256": marker_digest,
    }
    scratch = Path("/lab-scratch")
    (scratch / "media-fixture.json").write_text(
        json.dumps(fixture, sort_keys=True, indent=2), encoding="utf-8"
    )
    print("T7 synthetic media fixture ready; IDs and account details were not displayed.")


if __name__ == "__main__":
    main()
