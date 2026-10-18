import uuid
from contextlib import contextmanager

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import User

from .models import CollaboratorProfile, FolderAccess

QR_SALT = "llave-extra.collaborator-referral.v1"


def sign_qr(profile: CollaboratorProfile) -> str:
    return signing.dumps({"id": str(profile.pk), "v": profile.qr_version}, key=settings.QR_SIGNING_KEY, salt=QR_SALT, compress=False)


def parse_qr(token: str) -> tuple[str, int]:
    try:
        data = signing.loads(token, key=settings.QR_SIGNING_KEY, salt=QR_SALT)
        if set(data) != {"id", "v"} or type(data["v"]) is not int or data["v"] < 1:
            raise ValueError
        return str(uuid.UUID(str(data["id"]))), data["v"]
    except (signing.BadSignature, ValueError, TypeError, KeyError):
        raise ValidationError({"token": "Referencia inválida"}) from None


def active_folder_access(user: User, profile: CollaboratorProfile) -> bool:
    """E3 visibility gate: evaluate current roles, enabled state and version in the database."""
    if not user.is_authenticated or not user.pk:
        return False
    return FolderAccess.objects.filter(
        tourist_id=user.pk, tourist__is_active=True, tourist__role=User.Role.TOURIST,
        collaborator_id=profile.pk, collaborator__enabled=True,
        collaborator__user__is_active=True, collaborator__user__role=User.Role.COLLABORATOR,
        qr_version=F("collaborator__qr_version"),
    ).exists()


@contextmanager
def locked_folder_access(user: User, profile_id):
    """E4 gate: keep profile row locked through the caller's transaction."""
    if not user.is_authenticated or not user.pk:
        raise PermissionDenied("Acceso a carpeta no autorizado")
    with transaction.atomic():
        User.objects.select_for_update().get(pk=user.pk)
        profile = CollaboratorProfile.objects.select_for_update().select_related("user").filter(pk=profile_id).first()
        if profile is None or not active_folder_access(user, profile):
            raise PermissionDenied("Acceso a carpeta no autorizado")
        yield profile


def redeem_qr(user: User, raw: str) -> FolderAccess:
    if not user.is_authenticated or not user.pk:
        raise PermissionDenied("Solo turistas activos pueden acceder")
    profile_id, version = parse_qr(raw)
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)
        if not locked_user.is_active or locked_user.role != User.Role.TOURIST:
            raise PermissionDenied("Solo turistas activos pueden acceder")
        profile = CollaboratorProfile.objects.select_for_update().select_related("user").filter(pk=profile_id).first()
        if (profile is None or not profile.enabled or not profile.user.is_active
                or profile.user.role != User.Role.COLLABORATOR or profile.qr_version != version):
            raise ValidationError({"token": "Referencia inválida"})
        grant, _ = FolderAccess.objects.get_or_create(tourist=locked_user, collaborator=profile, qr_version=version)
        return grant
