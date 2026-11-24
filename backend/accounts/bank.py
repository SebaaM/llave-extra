import base64
import json
import secrets
import uuid

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.views.decorators.debug import sensitive_variables
from rest_framework.exceptions import APIException

from .models import CollaboratorBankDetails

NONCE_SIZE = 12


class BankDetailsUnavailable(APIException):
    status_code = 503
    default_detail = "Los datos bancarios no están disponibles en este momento."


@sensitive_variables()
def _cipher():
    encoded = getattr(settings, "BANK_DETAILS_ENCRYPTION_KEY", "")
    try:
        key = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
    except ValueError:
        raise BankDetailsUnavailable() from None
    if len(key) != 32:
        raise BankDetailsUnavailable()
    return AESGCM(key)


def _associated_data(user_id, version):
    return f"llave-extra:bank-details:v1:{user_id}:{version}".encode("ascii")


@sensitive_variables()
def replace_bank_details(user_id, *, cbu, alias):
    """El llamador mantiene el lock de User para serializar incluso el primer alta."""
    version = uuid.uuid4()
    nonce = secrets.token_bytes(NONCE_SIZE)
    plaintext = json.dumps({"cbu": cbu, "alias": alias}).encode("utf-8")
    ciphertext = nonce + _cipher().encrypt(nonce, plaintext, _associated_data(user_id, version))
    CollaboratorBankDetails.objects.update_or_create(
        user_id=user_id, defaults={"version": version, "ciphertext": ciphertext},
    )


@sensitive_variables()
def locked_bank_version(user_id) -> uuid.UUID | None:
    """Consulta transaccional que bloquea solo la fila bancaria, si existe."""
    row = CollaboratorBankDetails.objects.select_for_update().filter(user_id=user_id).first()
    if row is None:
        return None
    _decrypt(row)
    return row.version


@sensitive_variables()
def _decrypt(row):
    ciphertext = bytes(row.ciphertext)
    try:
        plaintext = _cipher().decrypt(
            ciphertext[:NONCE_SIZE], ciphertext[NONCE_SIZE:], _associated_data(row.user_id, row.version),
        )
        return json.loads(plaintext)
    except (InvalidTag, ValueError):
        raise BankDetailsUnavailable() from None


@sensitive_variables()
def reveal_bank_details(user_id) -> dict[str, str] | None:
    """Solo para llamadores autorizados. El llamador audita una revelación administrativa."""
    row = CollaboratorBankDetails.objects.filter(user_id=user_id).first()
    return _decrypt(row) if row is not None else None


@sensitive_variables()
def masked_bank_details(user_id):
    values = reveal_bank_details(user_id)
    if values is None:
        return {"configured": False, "cbu_masked": None, "alias_masked": None}
    return {
        "configured": True,
        "cbu_masked": f"•••• {values['cbu'][-4:]}",
        "alias_masked": "••••" if values["alias"] else None,
    }
