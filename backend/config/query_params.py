from rest_framework.exceptions import ValidationError


def reject_null_filters(params, *names: str) -> None:
    errors = {
        name: "El filtro no admite caracteres nulos."
        for name in names
        if "\x00" in params.get(name, "")
    }
    if errors:
        raise ValidationError(errors)
