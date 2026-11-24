import json
from io import StringIO

import psycopg
import pytest
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.db.models import Sum

from accounts.demo_activity import activity
from accounts.demo_activity.catalog import PREFIX, email, identity
from accounts.management.commands.seed_activity_demo import LOCK_ID
from accounts.models import User
from credits.models import AdjustmentCase, Consumption, Wallet, WalletEntry
from providers.models import CatalogConfig, DemoSeedState, Provider
from referrals.models import CollaboratorProfile
from shop.models import Order, OrderAudit, OrderLine, Product, ShopSettings, StockAdjustment

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def demo(settings, tmp_path, monkeypatch):
    settings.DEBUG = True
    settings.SHOP_PAYMENT_PROVIDER = "fake"
    settings.DEMO_CREDENTIALS_PATH = tmp_path / "legacy.md"

    def no_http(*args, **kwargs):
        raise AssertionError("El seed no puede usar HTTP externo")

    monkeypatch.setattr("urllib.request.urlopen", no_http)
    return tmp_path / "activity-demo.local.json"


def load(count=60):
    output = StringIO()
    call_command("seed_activity_demo", customers=count, stdout=output)
    return output.getvalue()


def snapshot():
    return {
        "users": list(User.objects.order_by("pk").values_list("pk", "password")),
        "wallets": list(Wallet.objects.order_by("pk").values_list("pk", "balance", "redemptions_frozen")),
        "entries": WalletEntry.objects.count(),
        "stock": list(Product.objects.order_by("pk").values_list("pk", "stock")),
        "orders": list(Order.objects.order_by("pk").values_list("pk", "state", "payment_confirmed")),
        "visits": Consumption.objects.count(), "audit": OrderAudit.objects.count(),
    }


def assert_accounting():
    for wallet in Wallet.objects.all():
        assert wallet.balance == (wallet.entries.aggregate(total=Sum("delta"))["total"] or 0)
        assert wallet.redemptions_frozen == AdjustmentCase.objects.filter(
            consumption__tourist_id=wallet.tourist_id, resolved_at__isnull=True).exists()
    for product in Product.objects.all():
        loaded = StockAdjustment.objects.filter(product=product).aggregate(total=Sum("delta"))["total"] or 0
        used = OrderLine.objects.filter(product=product, order__stock_released=False).aggregate(total=Sum("quantity"))["total"] or 0
        assert product.stock == loaded - used


def test_demo_populates_backoffice_and_financial_states_without_external_http(demo):
    output = load()
    assert User.objects.filter(role="TOURIST").count() == 60
    assert Provider.objects.count() == 30
    assert CollaboratorProfile.objects.count() == 10
    assert Product.objects.count() == 12
    assert Consumption.objects.count() > 150
    assert Consumption.objects.filter(collaborator__isnull=True).exists()
    assert Consumption.objects.filter(collaborator__isnull=False).exists()
    assert Consumption.objects.filter(state="ANNULLED").exists()
    assert not Consumption.objects.filter(tourist__email_verified=False).exists()
    assert not Consumption.objects.filter(tourist__is_active=False).exists()
    assert set(Order.objects.filter(mode="MONEY").values_list("state", flat=True)) == set(activity.PAYMENT_STATES)
    assert not Order.objects.filter(mode="MONEY").exclude(payment_provider="fake").exists()
    assert not Order.objects.exclude(checkout_url="").exists()
    assert AdjustmentCase.objects.filter(resolved_at__isnull=True).exists()
    assert AdjustmentCase.objects.filter(resolution="FUNDED").exists()
    assert AdjustmentCase.objects.filter(resolution="FORGIVEN").exists()
    credentials = json.loads(demo.read_text())
    admin = User.objects.get(email=email("admin"))
    assert admin.check_password(credentials["users"][admin.email])
    assert not any(secret in output for secret in credentials["users"].values())
    assert not any(pin in output for pin in credentials["pins"].values())
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(admin)
    for resource in ("dashboard", "users", "providers", "benefits", "collaborators", "consumptions",
                     "wallets", "adjustments", "products", "orders", "cancellations", "payment-operations", "activity"):
        assert client.get(f"/api/v1/admin/{resource}/").status_code == 200, resource
    assert client.get(f"/api/v1/admin/collaborators/{identity('profile', 0)}/summary/").status_code == 200
    assert_accounting()


def test_repeat_preserves_edits_passwords_ledger_stock_and_states(demo):
    load()
    provider = Provider.objects.get(pk=identity("provider", 0))
    provider.name = "DEMO editado por operador"
    provider.status = "INACTIVE"
    provider.save(update_fields=["name", "status"])
    CollaboratorProfile.set_enabled(identity("profile", 0), False)
    pending = User.objects.get(email=email("cliente", 1))
    pending.email_verified = True
    pending.save(update_fields=["email_verified"])
    before = snapshot()
    secrets_before = demo.read_bytes()
    load()
    assert snapshot() == before
    assert demo.read_bytes() == secrets_before
    provider.refresh_from_db()
    assert provider.name == "DEMO editado por operador" and provider.status == "INACTIVE"
    assert not CollaboratorProfile.objects.get(pk=identity("profile", 0)).enabled
    assert_accounting()


def test_can_resume_after_fake_create_commits_without_duplicate_consumptions(demo, monkeypatch):
    original = activity.process_order
    interrupted = False

    def crash_after_create(order, kind):
        nonlocal interrupted
        original(order, kind)
        if kind == "CREATE" and not interrupted:
            interrupted = True
            raise RuntimeError("simulación de interrupción después del commit")

    monkeypatch.setattr(activity, "process_order", crash_after_create)
    with pytest.raises(RuntimeError):
        load(20)
    first_user = User.objects.get(email=email("cliente", 3))
    visits = list(first_user.consumptions.values_list("pk", flat=True))
    password = first_user.password
    monkeypatch.setattr(activity, "process_order", original)
    load(20)
    first_user.refresh_from_db()
    assert first_user.password == password
    assert list(first_user.consumptions.values_list("pk", flat=True)) == visits
    assert_accounting()


def test_extend_and_missing_file_do_not_reset_existing_activity(demo):
    load(20)
    first_ids = set(Consumption.objects.values_list("pk", flat=True))
    load(40)
    assert first_ids <= set(Consumption.objects.values_list("pk", flat=True))
    assert User.objects.filter(role="TOURIST").count() == 40
    before = snapshot()
    demo.unlink()
    with pytest.raises(CommandError, match="archivo completo"):
        load(40)
    assert snapshot() == before


def test_collision_does_not_overwrite_existing_accounts(demo):
    user = User.objects.create_user(email("admin"), "Existing-local-password", role="TOURIST")
    before = user.password
    with pytest.raises(CommandError, match="Colisión"):
        load(20)
    user.refresh_from_db()
    assert User.objects.count() == 1 and user.password == before and user.role == "TOURIST"
    assert not DemoSeedState.objects.filter(pk=f"{PREFIX}:catalog").exists()
    assert not Provider.objects.exists()


def test_existing_disabled_pickup_requires_operator_configuration(demo):
    ShopSettings.objects.create(pickup_enabled=False, pickup_name="Retiro existente", pickup_address="Existente")
    with pytest.raises(CommandError, match="retiro"):
        load(20)
    assert not User.objects.exists()
    assert not ShopSettings.objects.get(pk=1).pickup_enabled


def test_does_not_change_existing_catalog_or_non_demo_records(demo):
    from credits.models import CreditPolicy

    CatalogConfig.objects.create(enabled=False)
    CreditPolicy.objects.create(base_reward=55, target_visits=7)
    real = Provider.objects.create(slug="no-demo", name="Comercio existente", status="DRAFT")
    load(20)
    assert not CatalogConfig.objects.get(pk=1).enabled
    assert CreditPolicy.objects.get(pk=1).base_reward == 55
    real.refresh_from_db()
    assert real.name == "Comercio existente" and not real.demo and real.status == "DRAFT"
    assert_accounting()


@pytest.mark.parametrize("debug,provider", [(False, "fake"), (True, "disabled"), (True, "mercadopago")])
def test_rejects_unsafe_execution(demo, settings, debug, provider):
    settings.DEBUG, settings.SHOP_PAYMENT_PROVIDER = debug, provider
    with pytest.raises(CommandError, match="Requiere"):
        load(20)
    assert not User.objects.exists()
    assert not demo.exists()


def test_simultaneous_execution_is_rejected_without_mutation(demo):
    config = settings.DATABASES["default"]
    with psycopg.connect(dbname=connection.settings_dict["NAME"], user=config["USER"], password=config["PASSWORD"],
                         host=config["HOST"], port=config["PORT"], autocommit=True) as other:
        other.execute("SELECT pg_advisory_lock(%s)", [LOCK_ID])
        try:
            with pytest.raises(CommandError, match="otra carga"):
                load(20)
            assert not User.objects.exists()
        finally:
            other.execute("SELECT pg_advisory_unlock(%s)", [LOCK_ID])


def test_private_manifest_from_another_database_is_not_reused_or_overwritten(demo):
    document = {"kind": PREFIX, "database_id": "other-database", "users": {}, "pins": {}}
    demo.write_text(json.dumps(document), encoding="utf-8")
    before = demo.read_bytes()
    with pytest.raises(CommandError, match="otra base"):
        load(20)
    assert not User.objects.exists()
    assert demo.read_bytes() == before


def test_refuses_an_outer_transaction_before_writing_credentials(demo):
    from django.db import transaction

    with transaction.atomic(), pytest.raises(CommandError, match="transacción externa"):
        load(20)
    assert not User.objects.exists() and not demo.exists()


def test_customer_batch_reserves_later_providers_before_retaining_policy(demo, monkeypatch):
    import threading

    from django.db import close_old_connections

    from accounts.demo_activity.catalog import Credentials
    from providers.models import FolderBenefit

    load(20)
    index = 23
    selections = list(FolderBenefit.objects.filter(collaborator_id=identity("profile", index % 8))
                      .select_related("benefit").order_by("benefit_id"))
    later_provider = selections[1].benefit.provider_id
    awarded, release = threading.Event(), threading.Event()
    errors = []
    original = activity.award_consumption

    def pause_after_first(*args, **kwargs):
        result = original(*args, **kwargs)
        if not awarded.is_set():
            awarded.set()
            if not release.wait(15):
                raise RuntimeError("El test no liberó el lote")
        return result

    def worker():
        close_old_connections()
        try:
            activity.seed_customer(Credentials(demo), index)
        except BaseException as exc:
            errors.append(exc)
        finally:
            close_old_connections()

    monkeypatch.setattr(activity, "award_consumption", pause_after_first)
    thread = threading.Thread(target=worker)
    thread.start()
    try:
        assert awarded.wait(15)
        config = connection.settings_dict
        with psycopg.connect(dbname=config["NAME"], user=config["USER"], password=config["PASSWORD"],
                             host=config["HOST"], port=config["PORT"]) as other:
            other.execute("SET LOCAL lock_timeout = '300ms'")
            with pytest.raises(psycopg.errors.LockNotAvailable):
                other.execute("SELECT id FROM providers_provider WHERE id = %s FOR UPDATE", [later_provider])
    finally:
        release.set()
        thread.join(20)
    assert not thread.is_alive() and not errors
    assert_accounting()


def test_default_volume_and_repeat_are_financially_consistent(demo):
    output = StringIO()
    call_command("seed_activity_demo", stdout=output)
    result = activity.summary()
    print("DEFAULT_DEMO_SUMMARY=" + json.dumps(result))
    demo.with_name("summary.json").write_text(json.dumps(result), encoding="utf-8")
    assert result["clients"] == 300
    assert result["consumptions"] > 800
    assert sum(item["count"] for item in result["orders"]) > 150
    before = snapshot()
    call_command("seed_activity_demo", stdout=StringIO())
    assert snapshot() == before
    assert_accounting()
