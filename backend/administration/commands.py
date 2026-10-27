import re
from dataclasses import dataclass

from django.db import connection, transaction
from rest_framework.exceptions import ValidationError

from credits.services import Conflict
from shop.services import require_admin

from .concurrency import signed_digest
from .models import AdminAudit, AdminCommand

SENSITIVE_PARTS = {"password", "pin", "qr", "token", "secret", "fingerprint", "payload", "key", "hash", "checkout_url"}


def sensitive_name(name):
    parts = set(re.split(r"[^a-z0-9]+", re.sub(r"([a-z])([A-Z])", r"\1_\2", name).lower()))
    return bool(parts & SENSITIVE_PARTS) or name.lower() == "checkout_url"


def validate_safe_response(data):
    """Fail closed for private DTO keys; callbacks must return explicit public DTOs."""
    if isinstance(data, dict):
        for key, value in data.items():
            if not isinstance(key, str) or sensitive_name(key):
                raise ValueError("El comando intentó persistir una respuesta privada.")
            validate_safe_response(value)
    elif isinstance(data, list):
        for value in data:
            validate_safe_response(value)
    elif data is not None and not isinstance(data, (str, int, float, bool)):
        raise ValueError("La respuesta debe ser un DTO JSON saneado.")


@dataclass(frozen=True)
class CommandResult:
    data: dict
    status_code: int = 200


def record_audit(actor, action, resource, object_id, changed_fields=(), reason=""):
    if not connection.in_atomic_block:
        raise RuntimeError("La auditoría debe ser atómica con su efecto.")
    audit = AdminAudit(actor=actor, action=action, resource=resource, object_id=str(object_id),
                       changed_fields=sorted({name for name in changed_fields if not sensitive_name(name)}), reason=reason)
    audit.full_clean()
    audit.save()
    return audit


def run_command(actor, action, key, payload, callback):
    """Lock a dedicated key before domain locks. Callback: () -> CommandResult; no HTTP."""
    require_admin(actor)
    if not isinstance(key, str) or not key.strip() or len(key) > 128:
        raise ValidationError({"Idempotency-Key": "Ingresá una clave de hasta 128 caracteres."})
    if not isinstance(action, str) or not action or len(action) > 100:
        raise ValueError("Acción administrativa inválida.")
    fingerprint = signed_digest("command-payload", {"actor": str(actor.pk), "action": action, "payload": payload})
    with transaction.atomic():
        command, _ = AdminCommand.objects.get_or_create(actor=actor, action=action, key=key,
                                                       defaults={"fingerprint": fingerprint})
        command = AdminCommand.objects.select_for_update().get(pk=command.pk)
        require_admin(actor)
        if command.fingerprint != fingerprint:
            raise Conflict("La clave ya se utilizó con otros datos.")
        if command.completed:
            return CommandResult(command.response, command.status_code)
        result = callback()
        if not isinstance(result, CommandResult) or not isinstance(result.data, dict) or not 200 <= result.status_code < 300:
            raise ValueError("El callback debe devolver CommandResult con éxito HTTP.")
        validate_safe_response(result.data)
        command.response, command.status_code, command.completed = result.data, result.status_code, True
        command.save(update_fields=["response", "status_code", "completed"])
        return result
