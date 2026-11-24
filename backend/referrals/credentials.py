"""Stable own reference credential preconditions and manual renewal; no Admin commands."""

import hmac
import json

from django.db import transaction
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import User
from credits.services import Conflict

from .models import CollaboratorProfile, QRRenewalReceipt


def _digest(namespace, data):
    return salted_hmac("referrals.own-credential." + namespace,
                       json.dumps(data, sort_keys=True, separators=(",", ":")), algorithm="sha256").hexdigest()


def credential_version(profile):
    """Opaque non-secret precondition; selections and presentation are deliberately independent."""
    return _digest("version", {"id": str(profile.pk), "user_id": str(profile.user_id),
                               "enabled": profile.enabled, "generation": profile.qr_version,
                               "role": profile.user.role, "active": profile.user.is_active})


def renew_own_qr(actor, key, version):
    with transaction.atomic():
        # Serialize all renewals for one actor before touching profile or receipt.
        # Replays must pass the same current authorization as a new action.
        user = User.objects.select_for_update().filter(pk=actor.pk).first()
        if user is None or not user.is_active or user.role != User.Role.COLLABORATOR:
            raise PermissionDenied("Solo colaboradores habilitados")
        profile = (CollaboratorProfile.objects.select_for_update(of=("self",)).select_related("user")
                   .filter(user_id=user.pk).first())
        if profile is None or profile.user_id != user.pk or not profile.enabled:
            raise PermissionDenied("Solo colaboradores habilitados")
        if not isinstance(key, str) or not key.strip() or len(key) > 128:
            raise ValidationError({"Idempotency-Key": "Ingresá una clave de hasta 128 caracteres."})
        digest = _digest("payload", {"actor": str(user.pk), "version": version})
        receipt = QRRenewalReceipt.objects.filter(actor=user, key=key).first()
        if receipt is not None:
            if receipt.profile_id != profile.pk or not hmac.compare_digest(receipt.payload_digest, digest):
                raise Conflict("La clave ya se utilizó con otros datos.")
            return {"id": str(receipt.profile_id), "status": "renewed", "version": receipt.result_version}
        if not isinstance(version, str) or not hmac.compare_digest(credential_version(profile), version):
            raise Conflict("La referencia cambió. Volvé a consultar antes de renovar.")
        previous = profile.qr_version
        profile.qr_version += 1
        profile.save(update_fields=["qr_version"])
        result_version = credential_version(profile)
        # Only explicit scalar fields are persisted; QR, URL and PIN never enter this audit.
        QRRenewalReceipt.objects.create(actor=user, key=key, payload_digest=digest, profile=profile,
                                      previous_version=previous, renewed_version=profile.qr_version,
                                      result_version=result_version)
        return {"id": str(profile.pk), "status": "renewed", "version": result_version}
