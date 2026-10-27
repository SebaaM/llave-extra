from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

import pytest
from django.db import close_old_connections, connection, connections, transaction
from rest_framework.exceptions import APIException
from rest_framework.test import APIClient

from accounts.models import User
from administration.commands import CommandResult, record_audit, run_command
from administration.models import AdminAudit, AdminCommand, SiteSettings
from credits.models import CreditPolicy
from providers.models import CatalogConfig
from shop.models import ShopSettings

pytestmark = pytest.mark.django_db(transaction=True)


def client(user=None):
    api = APIClient()
    if user:
        api.force_authenticate(user)
    return api


@pytest.fixture
def admin():
    return User.objects.create_superuser("admin@example.test")


@pytest.mark.parametrize("role,staff,superuser,active", [
    ("TOURIST", True, False, True), ("COLLABORATOR", True, False, True),
    ("PROVIDER", True, False, True), ("ADMIN", False, True, True),
    ("ADMIN", True, False, True), ("ADMIN", True, True, False),
])
def test_every_admin_endpoint_requires_all_privileges(role, staff, superuser, active):
    user = User.objects.create_user("partial@example.test", role=role, is_staff=staff,
                                    is_superuser=superuser, is_active=active)
    for path in ["settings/general/", "settings/catalog/", "settings/credits/", "settings/shop/", "activity/"]:
        assert client(user).get("/api/v1/admin/" + path).status_code == 403
        if path != "activity/":
            assert client(user).patch("/api/v1/admin/" + path, {}, format="json").status_code == 403


def test_anonymous_and_read_only_defaults(admin):
    assert client().get("/api/v1/admin/settings/general/").status_code == 401
    public = client().get("/api/v1/site-settings/")
    assert public.status_code == 200
    assert set(public.data) == {"site_name", "home_title", "home_description", "footer_text", "contact_email", "whatsapp_url", "instagram_url"}
    assert public.data["site_name"] == "Llave Extra"
    for group in ["general", "catalog", "credits", "shop"]:
        response = client(admin).get(f"/api/v1/admin/settings/{group}/")
        assert response.status_code == 200 and response.data["version"]
    for model in [SiteSettings, CatalogConfig, CreditPolicy, ShopSettings, AdminAudit]:
        assert model.objects.count() == 0


def test_patch_defaults_public_effect_and_audit(admin):
    api = client(admin)
    path = "/api/v1/admin/settings/general/"
    before = api.get(path).data
    response = api.patch(path, {"version": before["version"], "home_title": "Una ciudad para descubrir"}, format="json")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response["Referrer-Policy"] == "no-referrer"
    assert client().get("/api/v1/site-settings/").data["home_title"] == "Una ciudad para descubrir"
    assert response.data["version"] != before["version"]
    audit = AdminAudit.objects.get()
    assert audit.changed_fields == ["home_title"]
    assert audit.actor == admin
    listed = api.get("/api/v1/admin/activity/?action=settings.update&resource=settings.general&search=admin&actor=" + str(admin.pk))
    assert listed.data["count"] == 1
    assert set(listed.data["results"][0]) == {"id", "source", "actor_email", "action", "resource", "object_id", "changed_fields", "reason", "created_at"}


@pytest.mark.parametrize("group,field,value,model", [
    ("general", "site_name", "Otra marca", SiteSettings),
    ("catalog", "enabled", False, CatalogConfig),
    ("credits", "base_reward", 200, CreditPolicy),
    ("shop", "pickup_name", "Punto", ShopSettings),
])
def test_precondition_detects_external_writes_and_missing_version(admin, group, field, value, model):
    api = client(admin)
    path = f"/api/v1/admin/settings/{group}/"
    initial = api.get(path).data
    assert api.patch(path, {field: value}, format="json").status_code == 409
    assert not model.objects.exists()
    obj = model.objects.create()
    setattr(obj, field, value)
    obj.save()
    response = api.patch(path, {"version": initial["version"], field: initial[field]}, format="json")
    assert response.status_code == 409
    obj.refresh_from_db()
    assert getattr(obj, field) == value
    assert not AdminAudit.objects.exists()


@pytest.mark.parametrize("version", ["versión", "é" * 64, "g" * 64, "a" * 63, "a" * 65, 7, [], None])
def test_malformed_version_returns_conflict_without_persistence(admin, version):
    response = client(admin).patch("/api/v1/admin/settings/general/",
                                   {"version": version, "site_name": "Nueva marca"}, format="json")
    assert response.status_code == 409
    assert not SiteSettings.objects.exists()
    assert not AdminAudit.objects.exists()


@pytest.mark.parametrize("field,value", [
    ("whatsapp_url", "http://wa.me/123"), ("whatsapp_url", "https://wa.me.evil.test/123"),
    ("whatsapp_url", "https://user@wa.me/123"), ("instagram_url", "https://instagram.com.evil.test/x"),
    ("instagram_url", "javascript:alert(1)"), ("home_title", "<b>Título</b>"),
    ("site_name", "x" * 161), ("contact_email", "not-email"), ("secret", "sensitive"),
])
def test_general_validation_and_no_internal_values_in_errors(admin, field, value):
    api = client(admin)
    path = "/api/v1/admin/settings/general/"
    response = api.patch(path, {"version": api.get(path).data["version"], field: value}, format="json")
    assert response.status_code == 400
    assert value not in str(response.data)
    assert not SiteSettings.objects.exists()


def test_existing_configuration_consumers_and_validation(admin):
    api = client(admin)
    for group, invalid in [("catalog", {"network_page_size": 99}), ("credits", {"target_visits": 0}),
                           ("shop", {"pickup_enabled": True}), ("shop", {"payment_provider": "fake"})]:
        path = f"/api/v1/admin/settings/{group}/"
        assert api.patch(path, {"version": api.get(path).data["version"], **invalid}, format="json").status_code == 400
    for group, valid, model in [
        ("catalog", {"enabled": False, "network_page_size": 14}, CatalogConfig),
        ("credits", {"base_reward": 300, "target_visits": 8}, CreditPolicy),
        ("shop", {"pickup_enabled": True, "pickup_name": "Punto", "pickup_address": "Calle", "pickup_hours": "9 a 18"}, ShopSettings),
    ]:
        path = f"/api/v1/admin/settings/{group}/"
        response = api.patch(path, {"version": api.get(path).data["version"], **valid}, format="json")
        assert response.status_code == 200
        config = model.objects.get()
        for field, value in valid.items():
            assert getattr(config, field) == value
    from providers.catalog import catalog_enabled
    assert catalog_enabled() is False


def test_commands_atomic_replay_conflict_and_secret_safety(admin):
    def effect():
        record_audit(admin, "synthetic", "settings.general", "1", ["site_name"])
        return CommandResult({"id": "1", "state": "done"}, 201)

    first = run_command(admin, "synthetic", "one", {"pin": "123456"}, effect)
    assert run_command(admin, "synthetic", "one", {"pin": "123456"}, effect) == first
    assert AdminAudit.objects.count() == AdminCommand.objects.count() == 1
    assert "123456" not in str(AdminCommand.objects.values().get())
    with pytest.raises(APIException) as conflict:
        run_command(admin, "synthetic", "one", {"pin": "654321"}, effect)
    assert conflict.value.status_code == 409

    def fail():
        record_audit(admin, "failed", "settings.general", "1", ["site_name"])
        raise ValueError("rollback")

    with pytest.raises(ValueError):
        run_command(admin, "failed", "two", {}, fail)
    with pytest.raises(ValueError):
        run_command(admin, "unsafe", "three", {}, lambda: CommandResult({"qr_token": "secret"}))
    assert AdminAudit.objects.count() == AdminCommand.objects.count() == 1


def test_concurrent_commands_have_one_effect(admin):
    barrier = Barrier(2)

    def execute():
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '8s'")
                cursor.execute("SET statement_timeout = '15s'")
            barrier.wait(timeout=10)
            def effect():
                record_audit(admin, "parallel", "settings.general", "1", ["site_name"])
                return CommandResult({"state": "done"})
            return run_command(admin, "parallel", "same", {}, effect)
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(execute) for _ in range(2)]
        assert futures[0].result(timeout=20) == futures[1].result(timeout=20)
    assert AdminCommand.objects.count() == AdminAudit.objects.count() == 1


def test_audit_requires_atomic_and_excludes_sensitive_fields(admin):
    with pytest.raises(RuntimeError):
        record_audit(admin, "update", "provider", "1", ["name"])
    with transaction.atomic():
        record_audit(admin, "update", "provider", "1", ["name", "pin", "pin_hash", "qr_token", "password"])
    assert AdminAudit.objects.get().changed_fields == ["name"]


def test_settings_and_audit_rollback_together(admin):
    api = client(admin)
    path = "/api/v1/admin/settings/general/"
    before = api.get(path).data
    with patch("administration.views.record_audit", side_effect=RuntimeError("audit unavailable")):
        with pytest.raises(RuntimeError):
            api.patch(path, {"version": before["version"], "site_name": "Cambio"}, format="json")
    assert not SiteSettings.objects.exists()
    assert not AdminAudit.objects.exists()


def test_commands_recheck_persisted_privileges_and_validate_keys(admin):
    User.objects.filter(pk=admin.pk).update(is_active=False)
    with pytest.raises(APIException) as forbidden:
        run_command(admin, "stale", "one", {}, lambda: CommandResult({}))
    assert forbidden.value.status_code == 403
    User.objects.filter(pk=admin.pk).update(is_active=True)
    for key in [None, "", " ", "x" * 129]:
        with pytest.raises(APIException) as invalid:
            run_command(admin, "invalid", key, {}, lambda: CommandResult({}))
        assert invalid.value.status_code == 400
    assert not AdminCommand.objects.exists()


def test_concurrent_first_settings_write_rejects_stale_version(admin):
    path = "/api/v1/admin/settings/general/"
    version = client(admin).get(path).data["version"]
    barrier = Barrier(2)

    def save(title):
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '8s'")
                cursor.execute("SET statement_timeout = '15s'")
            barrier.wait(timeout=10)
            return client(admin).patch(path, {"version": version, "home_title": title}, format="json").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ["Portada A", "Portada B"]))
    assert sorted(results) == [200, 409]
    assert SiteSettings.objects.count() == AdminAudit.objects.count() == 1


def test_configuration_preserves_consumption_and_pickup_snapshots(admin):
    from credits.models import Consumption, ProviderConsumptionCredential
    from credits.services import set_provider_pin, sign_provider_qr
    from providers.models import Benefit, Provider
    from shop.models import Product
    from shop.services import checkout

    customer = User.objects.create_user("snapshot@example.test", email_verified=True)
    provider = Provider.objects.create(slug="snapshots", name="Prestador", status="PUBLISHED")
    Benefit.objects.create(provider=provider, title="Beneficio", conditions="Condiciones vigentes", status="PUBLISHED")
    set_provider_pin(provider.pk, "123456")
    token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=provider))
    response = client(customer).post("/api/v1/consumptions/", {"qr_token": token, "pin": "123456"},
                                     format="json", HTTP_IDEMPOTENCY_KEY="snapshot")
    assert response.status_code == 201
    consumption = Consumption.objects.get()
    original_rule = consumption.rule_snapshot.copy()
    api = client(admin)
    path = "/api/v1/admin/settings/credits/"
    assert api.patch(path, {"version": api.get(path).data["version"], "base_reward": 42}, format="json").status_code == 200
    consumption.refresh_from_db()
    assert consumption.rule_snapshot == original_rule

    path = "/api/v1/admin/settings/shop/"
    pickup = {"pickup_enabled": True, "pickup_name": "Original", "pickup_address": "Calle", "pickup_hours": "9 a 18"}
    assert api.patch(path, {"version": api.get(path).data["version"], **pickup}, format="json").status_code == 200
    product = Product.objects.create(name="Producto", active=True, stock=1, price_credits=1)
    order, _ = checkout(customer.pk, mode="CREDITS", idempotency_key="snapshot", items=[{"product_id": str(product.pk), "quantity": 1}])
    assert api.patch(path, {"version": api.get(path).data["version"], "pickup_name": "Nuevo"}, format="json").status_code == 200
    order.refresh_from_db()
    assert order.pickup_snapshot == {"name": "Original", "address": "Calle", "hours": "9 a 18"}
