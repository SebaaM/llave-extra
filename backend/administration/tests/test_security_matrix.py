import re

import pytest
from django.urls import URLResolver, get_resolver
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from administration.models import AdminAudit
from providers.models import Benefit, Provider
from shop.models import Order, Product


def admin_api_paths(patterns, prefix=""):
    for entry in patterns:
        path = prefix + str(entry.pattern)
        if isinstance(entry, URLResolver):
            yield from admin_api_paths(entry.url_patterns, path)
        elif path.startswith("api/v1/admin/") and hasattr(entry.callback, "cls"):
            view = entry.callback.cls
            methods = [method for method in ("get", "post", "put", "patch", "delete")
                       if method in view.http_method_names and hasattr(view, method)]
            if methods:
                concrete = re.sub(r"<int:\w+>", "987654321", path)
                concrete = re.sub(r"<uuid:\w+>", "00000000-0000-4000-8000-000000000111", concrete)
                concrete = re.sub(r"<str:\w+>", "providers", concrete)
                yield f"/{concrete}", methods


def authenticated_client(actor):
    access, _ = issue_session(actor)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.mark.django_db
def test_admin_api_denies_every_declared_operation_to_incomplete_roles_and_anonymous():
    admin = User.objects.create_superuser("matrix-admin@example.test")
    clients = {"anonimo": (APIClient(), 401)}
    for alias, role, staff, superuser in (
        ("sin-staff", User.Role.ADMIN, False, True),
        ("sin-superusuario", User.Role.ADMIN, True, False),
        ("cliente-staff", User.Role.TOURIST, True, False),
        ("prestador", User.Role.PROVIDER, False, False),
        ("colaborador", User.Role.COLLABORATOR, False, False),
    ):
        actor = User.objects.create_user(f"{alias}@example.test", role=role, is_staff=staff, is_superuser=superuser)
        clients[alias] = (authenticated_client(actor), 403)
    allowed = authenticated_client(admin)
    operations = list(admin_api_paths(get_resolver().url_patterns))
    assert operations
    models = (User, Provider, Benefit, Product, Order, AdminAudit)
    counts = {model: model.objects.count() for model in models}
    errors = []
    checks = 0
    for path, methods in operations:
        for method in methods:
            for alias, (client, expected) in clients.items():
                response = client.generic(method.upper(), path)
                checks += 1
                if response.status_code != expected:
                    errors.append((method, path, alias, expected, response.status_code))
        response = allowed.generic("TRACE", path)
        checks += 1
        if response.status_code != 405:
            errors.append(("TRACE", path, "admin", 405, response.status_code))
    assert not errors, errors
    assert counts == {model: model.objects.count() for model in models}
    print(f"{len(operations)} rutas ADMIN, {checks} aserciones de estado HTTP")
