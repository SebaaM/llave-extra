import re
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError


def validate_plain_text(value):
    if re.search(r"[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value):
        raise ValidationError("Ingresá texto plano sin etiquetas ni caracteres de control.")


def validate_contact_url(value, hosts):
    if not value:
        return
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "https" and parsed.hostname in hosts
                 and parsed.username is None and parsed.password is None
                 and parsed.port in (None, 443) and not any(c.isspace() for c in value)
                 and "\\" not in value)
    except ValueError:
        valid = False
    if not valid:
        raise ValidationError("Ingresá una URL HTTPS del servicio permitido, sin credenciales.")


def validate_whatsapp(value):
    validate_contact_url(value, {"wa.me", "api.whatsapp.com"})


def validate_instagram(value):
    validate_contact_url(value, {"instagram.com", "www.instagram.com"})
