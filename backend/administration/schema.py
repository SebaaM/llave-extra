"""Keep the required admin precondition in generated PATCH components.

Spectacular intentionally makes every PATCH serializer field optional. The admin
resource API is different: its version precondition is mandatory even on PATCH.
"""


def require_admin_patch_versions(result, generator, request, public):
    schemas = result.get("components", {}).get("schemas", {})
    for path, methods in result.get("paths", {}).items():
        if not path.startswith("/api/v1/admin/") or "patch" not in methods:
            continue
        operation = methods["patch"]
        if not operation.get("operationId", "").endswith("_update"):
            continue
        for media in operation.get("requestBody", {}).get("content", {}).values():
            reference = media.get("schema", {}).get("$ref", "")
            component = schemas.get(reference.removeprefix("#/components/schemas/"))
            if component and "version" in component.get("properties", {}):
                component["required"] = sorted(set(component.get("required", ())) | {"version"})
    return result
