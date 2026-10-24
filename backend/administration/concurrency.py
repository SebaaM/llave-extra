import hmac
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.utils.crypto import salted_hmac

from credits.services import Conflict


def signed_digest(namespace, value):
    serialized = json.dumps(value, cls=DjangoJSONEncoder, sort_keys=True, separators=(",", ":"))
    return salted_hmac("administration." + namespace, serialized, algorithm="sha256").hexdigest()


def resource_version(instance, *, fields=None, resource=None):
    """HMAC includes persisted values (file names, never file URLs), even external edits."""
    names = fields if fields is not None else [field.attname for field in instance._meta.concrete_fields]
    state = {}
    for name in names:
        value = getattr(instance, name)
        state[name] = value.name if hasattr(value, "name") else value
    return signed_digest("version", {"resource": resource or instance._meta.label_lower,
                                     "pk": str(instance.pk), "state": state})


def require_version(instance, version, *, fields=None, resource=None):
    if not isinstance(version, str) or not hmac.compare_digest(resource_version(instance, fields=fields, resource=resource), version):
        raise Conflict("El registro cambió o falta su versión. Recargá antes de guardar.")
