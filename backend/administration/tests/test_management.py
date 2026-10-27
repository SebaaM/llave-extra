from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connections, transaction
from django.test import override_settings
from drf_spectacular.generators import SchemaGenerator
from rest_framework.exceptions import APIException
from rest_framework.test import APIClient

from accounts.models import AuthSession, User
from administration.operations import ACTION_INPUT
from credits.models import (
    AdjustmentCase,
    Consumption,
    ProviderConsumptionCredential,
    Wallet,
    WalletEntry,
)
from credits.services import award_consumption, credit_wallet, set_provider_pin, sign_provider_qr
from providers.models import Benefit, FolderBenefit, Provider, ProviderMembership
from referrals.models import CollaboratorProfile, FolderAccess
from shop.models import Order, PaymentOperation, Product, ShopSettings, StockAdjustment
from shop.services import checkout, request_cancellation


def parallel_domain_calls(*calls):
    """Race genuine PostgreSQL transactions, failing quickly on a lock cycle."""
    barrier = Barrier(len(calls))

    def run(call):
        close_old_connections()
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SET lock_timeout = '8s'")
                cursor.execute("SET statement_timeout = '15s'")
            barrier.wait(timeout=10)
            try:
                return call()
            except APIException as exc:
                return exc.status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(run, call) for call in calls]
        return [future.result(timeout=25) for future in futures]


def test_management_openapi_matches_required_inputs_and_real_outputs():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    paths = schema["paths"]
    components = schema["components"]["schemas"]

    def component(operation, *, response=False):
        entry = operation["responses"]["200"] if response else operation["requestBody"]
        reference = entry["content"]["application/json"]["schema"]["$ref"]
        return components[reference.rsplit("/", 1)[-1]]

    for resource in ("users", "providers", "benefits", "collaborators", "products", "credit-rules"):
        operation = paths[f"/api/v1/admin/{resource}/{{id}}/"]["patch"]
        assert "version" in component(operation)["required"]

    pin = paths["/api/v1/admin/providers/{id}/actions/set-pin/"]["post"]
    assert {"pin", "version"} <= set(component(pin)["required"])
    assert {"id", "status"} <= set(component(pin, response=True)["properties"])
    assert any(row["name"] == "Idempotency-Key" and row["required"] for row in pin["parameters"])
    for resource, action in ACTION_INPUT:
        operation = paths[f"/api/v1/admin/{resource}/{{id}}/actions/{action}/"]["post"]
        assert any(row["name"] == "Idempotency-Key" and row["required"] for row in operation["parameters"])
        assert "id" in component(operation, response=True)["properties"]
        request_fields = component(operation)["properties"]
        assert "version" in request_fields if resource in ("providers", "collaborators", "products", "credit-rules") else "reason" in request_fields
    stock = paths["/api/v1/admin/products/{id}/actions/adjust-stock/"]["post"]
    assert {"delta", "reason", "version"} <= set(component(stock)["required"])
    assert {"stock", "adjustment_id"} <= set(component(stock, response=True)["properties"])
    invite = paths["/api/v1/admin/users/{id}/invite/"]["post"]
    assert any(row["name"] == "Idempotency-Key" and row["required"] for row in invite["parameters"])
    assert {"id", "delivery"} <= set(component(invite, response=True)["properties"])
    qr = paths["/api/v1/admin/{resource}/{id}/qr/"]["get"]
    assert "url" in component(qr, response=True)["properties"]
    recommendations = paths["/api/v1/admin/collaborators/{id}/recommendations/"]["get"]
    response = component(recommendations, response=True)
    assert "recommendations" in response["properties"]
    item = components[response["properties"]["recommendations"]["items"]["$ref"].rsplit("/", 1)[-1]]
    assert {"benefit_id", "available", "benefit"} <= set(item["properties"])


@pytest.mark.django_db(transaction=True)
@override_settings(RATE_LIMITS={"consumption": (100, 300)})
def test_remove_selection_races_referred_consumption_without_partial_credit(admin_client):
    admin, client = admin_client
    tourist = User.objects.create_user("race-consume@example.test", "password", email_verified=True)
    collaborator = User.objects.create_user("race-referrer@example.test", "password", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    provider = Provider.objects.create(slug="race-consume", name="Race Consume", status="PUBLISHED")
    benefit = Benefit.objects.create(provider=provider, title="Offer", conditions="Valid", status="PUBLISHED")
    FolderBenefit.assign(profile.pk, benefit.pk)
    FolderAccess.objects.create(tourist=tourist, collaborator=profile, qr_version=profile.qr_version)
    set_provider_pin(provider.pk, "123456")
    token = sign_provider_qr(ProviderConsumptionCredential.objects.get(provider=provider))
    version = client.get(f"/api/v1/admin/collaborators/{profile.pk}/").data["version"]

    def remove():
        own = APIClient()
        own.force_authenticate(admin)
        return own.post(f"/api/v1/admin/collaborators/{profile.pk}/actions/remove-benefit/",
                        {"benefit_id": str(benefit.pk), "version": version}, format="json",
                        HTTP_IDEMPOTENCY_KEY="race-remove-selection").status_code

    def consume():
        return award_consumption(tourist, profile.pk, token, "123456", "race-referred-consume")[1]

    removal, earning = parallel_domain_calls(remove, consume)
    assert removal == 200
    assert earning in (201, 403)
    assert not FolderBenefit.objects.filter(collaborator=profile).exists()
    assert Consumption.objects.filter(collaborator=profile, provider=provider).count() == (earning == 201)
    assert WalletEntry.objects.filter(wallet__tourist=tourist, kind="EARN").count() == (earning == 201)
    wallet = Wallet.objects.filter(tourist=tourist).first()
    assert (wallet.balance if wallet else 0) == (1000 if earning == 201 else 0)


@pytest.mark.django_db(transaction=True)
def test_admin_stock_delta_races_checkout_with_one_coherent_winner(admin_client):
    admin, client = admin_client
    tourist = User.objects.create_user("race-checkout@example.test", "password", email_verified=True)
    with transaction.atomic():
        credit_wallet(tourist.pk, 1000, "fixture:race-checkout")
    product = Product.objects.create(name="Race Product", active=True, stock=1, price_credits=100)
    ShopSettings.objects.create(pickup_enabled=True, pickup_name="Punto", pickup_address="Calle", pickup_hours="9-18")
    version = client.get(f"/api/v1/admin/products/{product.pk}/").data["version"]

    def adjust():
        own = APIClient()
        own.force_authenticate(admin)
        return own.post(f"/api/v1/admin/products/{product.pk}/actions/adjust-stock/",
                        {"delta": -1, "reason": "Ajuste concurrente", "version": version}, format="json",
                        HTTP_IDEMPOTENCY_KEY="race-stock-minus").status_code

    def buy():
        checkout(tourist.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}],
                 idempotency_key="race-stock-buy")
        return 201

    adjusted, bought = parallel_domain_calls(adjust, buy)
    assert (adjusted == 200) != (bought == 201)
    assert Product.objects.get(pk=product.pk).stock == 0
    assert StockAdjustment.objects.filter(product=product).count() == (adjusted == 200)
    assert Order.objects.filter(customer=tourist).count() == (bought == 201)
    assert Wallet.objects.get(tourist=tourist).balance == (900 if bought == 201 else 1000)
    assert WalletEntry.objects.filter(wallet__tourist=tourist, kind="REDEEM").count() == (bought == 201)


@pytest.mark.django_db(transaction=True)
def test_admin_stock_delta_races_cancellation_release_without_lost_stock(admin_client):
    admin, client = admin_client
    tourist = User.objects.create_user("race-cancel@example.test", "password", email_verified=True)
    with transaction.atomic():
        credit_wallet(tourist.pk, 1000, "fixture:race-cancel")
    product = Product.objects.create(name="Race Cancel", active=True, stock=1, price_credits=100)
    ShopSettings.objects.create(pickup_enabled=True, pickup_name="Punto", pickup_address="Calle", pickup_hours="9-18")
    order, _ = checkout(tourist.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}],
                        idempotency_key="race-cancel-buy")
    cancellation = request_cancellation(tourist.pk, order.pk, reason="Cambio")
    version = client.get(f"/api/v1/admin/products/{product.pk}/").data["version"]

    def adjust():
        own = APIClient()
        own.force_authenticate(admin)
        return own.post(f"/api/v1/admin/products/{product.pk}/actions/adjust-stock/",
                        {"delta": 1, "reason": "Ingreso concurrente", "version": version}, format="json",
                        HTTP_IDEMPOTENCY_KEY="race-stock-plus").status_code

    def cancel():
        own = APIClient()
        own.force_authenticate(admin)
        return own.post(f"/api/v1/admin/cancellations/{cancellation.pk}/actions/approve/",
                        {"reason": "Solicitud aceptada"}, format="json",
                        HTTP_IDEMPOTENCY_KEY="race-cancel-approve").status_code

    adjusted, canceled = parallel_domain_calls(adjust, cancel)
    assert canceled == 200
    assert adjusted in (200, 409)
    order.refresh_from_db()
    assert order.state == "CANCELED" and order.stock_released
    assert Product.objects.get(pk=product.pk).stock == (2 if adjusted == 200 else 1)
    assert StockAdjustment.objects.filter(product=product, delta=1).count() == (adjusted == 200)
    assert Wallet.objects.get(tourist=tourist).balance == 1000
    assert WalletEntry.objects.filter(wallet__tourist=tourist, kind="REFUND").count() == 1


@pytest.fixture
def admin_client():
    admin = User.objects.create_superuser("admin-management@example.test", "strong-test-password")
    client = APIClient()
    client.force_authenticate(admin)
    return admin, client


@pytest.mark.django_db
def test_admin_guard_and_user_fields(admin_client):
    admin, client = admin_client
    endpoint = "/api/v1/admin/users/"
    assert APIClient().get(endpoint).status_code == 401
    for role in ("TOURIST", "PROVIDER", "COLLABORATOR", "ADMIN"):
        outsider = User.objects.create_user(f"{role.lower()}@example.test", "password", role=role)
        other = APIClient()
        other.force_authenticate(outsider)
        assert other.get(endpoint).status_code == 403
    assert client.post(endpoint, {"email": "x@example.test", "role": "ADMIN"}).status_code == 400
    assert client.post(endpoint, {"email": "x@example.test", "role": "TOURIST", "is_staff": True}).status_code == 400
    created = client.post(endpoint, {"email": "x@example.test", "role": "TOURIST"}, format="json")
    assert created.status_code == 201
    user = User.objects.get(pk=created.data["id"])
    assert not user.has_usable_password() and not user.is_staff and not user.email_verified
    assert "password" not in created.data
    assert client.patch(f"{endpoint}{user.pk}/", {"role": "ADMIN", "version": created.data["version"]}, format="json").status_code == 400
    session = AuthSession.objects.create(user=user, refresh_jti_hash="0" * 64)
    stale = client.patch(f"{endpoint}{user.pk}/", {"is_active": False, "version": "malformed"}, format="json")
    assert stale.status_code == 409
    disabled = client.patch(f"{endpoint}{user.pk}/", {"is_active": False, "version": created.data["version"]}, format="json")
    assert disabled.status_code == 200
    session.refresh_from_db()
    assert session.revoked_at is not None
    assert client.patch(f"{endpoint}{admin.pk}/", {"is_active": False, "version": client.get(f"{endpoint}{admin.pk}/").data["version"]}, format="json").status_code == 400


@pytest.mark.django_db
def test_provider_membership_selection_and_qr_replay(admin_client):
    _, client = admin_client
    provider_user = User.objects.create_user("owner@example.test", "password", role="PROVIDER")
    collaborator_user = User.objects.create_user("referrer@example.test", "password", role="COLLABORATOR")
    provider = client.post("/api/v1/admin/providers/", {"slug": "sample", "name": "Sample", "status": "PUBLISHED"}, format="json")
    assert provider.status_code == 201
    pid = provider.data["id"]
    action = f"/api/v1/admin/providers/{pid}/actions/assign-user/"
    assigned = client.post(action, {"user_id": provider_user.pk, "version": provider.data["version"]},
                           format="json", HTTP_IDEMPOTENCY_KEY="assign-1")
    assert assigned.status_code == 200
    assert ProviderMembership.objects.filter(user=provider_user, provider_id=pid).count() == 1
    assert client.post(action, {"user_id": provider_user.pk, "version": provider.data["version"]},
                       format="json", HTTP_IDEMPOTENCY_KEY="assign-1").status_code == 200
    assert client.post(action, {"user_id": provider_user.pk + 1, "version": provider.data["version"]},
                       format="json", HTTP_IDEMPOTENCY_KEY="assign-1").status_code == 409
    provider_after_membership = client.get(f"/api/v1/admin/providers/{pid}/").data
    pin = client.post(f"/api/v1/admin/providers/{pid}/actions/set-pin/",
                      {"pin": "123456", "version": provider_after_membership["version"]}, format="json", HTTP_IDEMPOTENCY_KEY="pin-1")
    assert pin.status_code == 200
    assert "pin" not in str(pin.data).lower()
    assert ProviderConsumptionCredential.objects.get(provider_id=pid).pin_hash != "123456"
    qr = client.get(f"/api/v1/admin/providers/{pid}/qr/")
    assert qr.status_code == 200 and "#token=" in qr.data["url"]
    assert client.get(f"/api/v1/admin/providers/{pid}/qr.png").status_code == 200
    provider_after_pin = client.get(f"/api/v1/admin/providers/{pid}/").data
    rotated = client.post(f"/api/v1/admin/providers/{pid}/actions/rotate-qr/", {"version": provider_after_pin["version"]},
                          format="json", HTTP_IDEMPOTENCY_KEY="rotate-1")
    assert rotated.status_code == 200
    assert client.get(f"/api/v1/admin/providers/{pid}/qr/").data["url"] != qr.data["url"]
    assert client.post(f"/api/v1/admin/providers/{pid}/actions/rotate-qr/", {"version": provider_after_pin["version"]},
                       format="json", HTTP_IDEMPOTENCY_KEY="rotate-1").status_code == 200
    benefit = client.post("/api/v1/admin/benefits/", {"provider": pid, "title": "Oferta", "conditions": "Condición",
                                                     "status": "PUBLISHED"}, format="json")
    assert benefit.status_code == 201
    profile = client.post("/api/v1/admin/collaborators/", {"user": collaborator_user.pk}, format="json")
    assert profile.status_code == 201
    add = client.post(f"/api/v1/admin/collaborators/{profile.data['id']}/actions/add-benefit/",
                      {"benefit_id": benefit.data["id"], "version": profile.data["version"]},
                      format="json", HTTP_IDEMPOTENCY_KEY="select-1")
    assert add.status_code == 200
    assert FolderBenefit.objects.filter(collaborator_id=profile.data["id"], benefit_id=benefit.data["id"]).exists()
    assert client.get(f"/api/v1/admin/collaborators/{profile.data['id']}/recommendations/").status_code == 200
    profile_after_selection = client.get(f"/api/v1/admin/collaborators/{profile.data['id']}/").data
    enabled = client.post(f"/api/v1/admin/collaborators/{profile.data['id']}/actions/enable/",
                          {"version": profile_after_selection["version"]}, format="json", HTTP_IDEMPOTENCY_KEY="enable-1")
    assert enabled.status_code == 200
    old_qr = client.get(f"/api/v1/admin/collaborators/{profile.data['id']}/qr/").data["url"]
    profile_now = client.get(f"/api/v1/admin/collaborators/{profile.data['id']}/").data
    assert client.post(f"/api/v1/admin/collaborators/{profile.data['id']}/actions/rotate-qr/",
                       {"version": profile_now["version"]}, format="json", HTTP_IDEMPOTENCY_KEY="collab-rotate").status_code == 200
    assert client.get(f"/api/v1/admin/collaborators/{profile.data['id']}/qr/").data["url"] != old_qr
    profile_now = client.get(f"/api/v1/admin/collaborators/{profile.data['id']}/").data
    removed = client.post(f"/api/v1/admin/collaborators/{profile.data['id']}/actions/remove-benefit/",
                          {"benefit_id": benefit.data["id"], "version": profile_now["version"]},
                          format="json", HTTP_IDEMPOTENCY_KEY="remove-1")
    assert removed.status_code == 200 and not FolderBenefit.objects.filter(collaborator_id=profile.data["id"]).exists()


@pytest.mark.django_db
def test_stock_delta_once_and_no_mass_assignment(admin_client):
    _, client = admin_client
    created = client.post("/api/v1/admin/products/", {"name": "Objeto", "price_credits": 10}, format="json")
    assert created.status_code == 201
    pid = created.data["id"]
    assert client.patch(f"/api/v1/admin/products/{pid}/", {"stock": 999, "version": created.data["version"]}, format="json").status_code == 400
    path = f"/api/v1/admin/products/{pid}/actions/adjust-stock/"
    body = {"delta": 5, "reason": "Ingreso", "version": created.data["version"]}
    first = client.post(path, body, format="json", HTTP_IDEMPOTENCY_KEY="stock-1")
    assert first.status_code == 200
    assert client.post(path, body, format="json", HTTP_IDEMPOTENCY_KEY="stock-1").data == first.data
    assert Product.objects.get(pk=pid).stock == 5
    assert StockAdjustment.objects.filter(product_id=pid).count() == 1
    assert client.post(path, {**body, "delta": 6}, format="json", HTTP_IDEMPOTENCY_KEY="stock-1").status_code == 409
    assert client.post(path, body, format="json", HTTP_IDEMPOTENCY_KEY="stock-2").status_code == 409


@pytest.mark.django_db(transaction=True)
def test_invite_reports_smtp_result_and_replay(admin_client, settings, monkeypatch):
    _, client = admin_client
    user = User.objects.create_user("invite@example.test", None, role="TOURIST")
    from administration import invitations

    sent = []
    def fake_send(*args):
        sent.append(args)
        raise RuntimeError("smtp unavailable")
    monkeypatch.setattr(invitations, "send_token_email", fake_send)
    path = f"/api/v1/admin/users/{user.pk}/invite/"
    failed = client.post(path, {}, format="json", HTTP_IDEMPOTENCY_KEY="invite-1")
    assert failed.status_code == 503 and failed.data["delivery"] == "FAILED"
    assert client.post(path, {}, format="json", HTTP_IDEMPOTENCY_KEY="invite-1").status_code == 503
    assert len(sent) == 1
    monkeypatch.setattr(invitations, "send_token_email", lambda *args: sent.append(args))
    resent = client.post(path, {}, format="json", HTTP_IDEMPOTENCY_KEY="invite-2")
    assert resent.status_code == 200 and resent.data["delivery"] == "SENT"
    assert len(sent) == 2


@pytest.mark.django_db(transaction=True)
def test_financial_action_wrappers_and_readonly_history(admin_client, settings):
    admin, client = admin_client
    tourist = User.objects.create_user("finance-customer@example.test", "password", email_verified=True)
    provider = Provider.objects.create(slug="finance-provider", name="Provider")
    consumption = Consumption.objects.create(tourist=tourist, provider=provider, award=100,
                                             rule_snapshot={"source": "global", "amount": 100, "target_visits": 5})
    path = f"/api/v1/admin/consumptions/{consumption.pk}/actions/annul/"
    assert client.patch(f"/api/v1/admin/consumptions/{consumption.pk}/", {"award": 900}, format="json").status_code == 405
    annul = client.post(path, {"reason": "Consumo inválido"}, format="json", HTTP_IDEMPOTENCY_KEY="annul-1")
    assert annul.status_code == 200 and annul.data["state"] == "ANNULLED"
    assert client.post(path, {"reason": "Consumo inválido"}, format="json", HTTP_IDEMPOTENCY_KEY="annul-1").data == annul.data
    case = AdjustmentCase.objects.get(consumption=consumption)
    resolved = client.post(f"/api/v1/admin/adjustments/{case.pk}/actions/resolve/",
                           {"reason": "Pérdida aceptada", "resolution": "FORGIVEN"}, format="json",
                           HTTP_IDEMPOTENCY_KEY="resolve-1")
    assert resolved.status_code == 200 and resolved.data["resolution"] == "FORGIVEN"
    assert Wallet.objects.get(tourist=tourist).redemptions_frozen is False

    with transaction.atomic():
        credit_wallet(tourist.pk, 1000, "fixture:financial")
    product = Product.objects.create(name="Llavero", active=True, stock=5, price_credits=100,
                                     price_money="500.00")
    ShopSettings.objects.create(pickup_enabled=True, pickup_name="Punto", pickup_address="Calle", pickup_hours="9-18")
    order, _ = checkout(tourist.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}],
                        idempotency_key="buy-1")
    detail = client.get(f"/api/v1/admin/orders/{order.pk}/")
    assert detail.status_code == 200 and detail.data["lines"][0]["name"] == "Llavero"
    assert "checkout_url" not in detail.data and "payload" not in str(detail.data)
    for action, expected in (("prepare", "READY"), ("deliver", "PICKED_UP")):
        response = client.post(f"/api/v1/admin/orders/{order.pk}/actions/{action}/",
                               {"reason": "Operación verificada"}, format="json", HTTP_IDEMPOTENCY_KEY=action)
        assert response.status_code == 200 and response.data["state"] == expected
    assert client.get("/api/v1/admin/activity/?resource=orders&action=READY").data["count"] == 1
    order2, _ = checkout(tourist.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}],
                         idempotency_key="buy-2")
    cancellation = request_cancellation(tourist.pk, order2.pk, reason="Cambio de plan")
    approved = client.post(f"/api/v1/admin/cancellations/{cancellation.pk}/actions/approve/",
                           {"reason": "Solicitud aceptada"}, format="json", HTTP_IDEMPOTENCY_KEY="cancel-1")
    assert approved.status_code == 200 and approved.data["state"] == "APPROVED"
    order2.refresh_from_db()
    assert order2.state == "CANCELED" and order2.stock_released
    order3, _ = checkout(tourist.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}],
                         idempotency_key="buy-3")
    cancellation3 = request_cancellation(tourist.pk, order3.pk, reason="Consulta")
    rejected = client.post(f"/api/v1/admin/cancellations/{cancellation3.pk}/actions/reject/",
                           {"reason": "Pedido vigente"}, format="json", HTTP_IDEMPOTENCY_KEY="cancel-2")
    assert rejected.status_code == 200 and rejected.data["state"] == "REJECTED"

    settings.SHOP_PAYMENT_PROVIDER = "fake"
    money, _ = checkout(tourist.pk, mode="MONEY", items=[{"product_id": str(product.pk), "quantity": 1}],
                        idempotency_key="money-1")
    Order.objects.filter(pk=money.pk).update(state="PAYMENT_REVIEW", remote_id="synthetic-remote")
    refund = client.post(f"/api/v1/admin/orders/{money.pk}/actions/refund/",
                         {"reason": "Pago en revisión"}, format="json", HTTP_IDEMPOTENCY_KEY="refund-1")
    assert refund.status_code == 200 and refund.data["state"] == "REFUND_PENDING"
    operation = PaymentOperation.objects.get(order=money, kind="REFUND")
    PaymentOperation.objects.filter(pk=operation.pk).update(state="BLOCKED")
    retried = client.post(f"/api/v1/admin/payment-operations/{operation.pk}/actions/retry/",
                          {"reason": "Reintento manual"}, format="json", HTTP_IDEMPOTENCY_KEY="retry-1")
    assert retried.status_code == 200 and retried.data["state"] == "PENDING"


@pytest.mark.django_db
def test_external_change_blocks_stale_patch_and_private_endpoints(admin_client):
    _, client = admin_client
    provider = Provider.objects.create(slug="version-provider", name="Original")
    detail = client.get(f"/api/v1/admin/providers/{provider.pk}/")
    Provider.objects.filter(pk=provider.pk).update(name="Changed externally")
    stale = client.patch(f"/api/v1/admin/providers/{provider.pk}/",
                         {"name": "Would overwrite", "version": detail.data["version"]}, format="json")
    assert stale.status_code == 409
    provider.refresh_from_db()
    assert provider.name == "Changed externally"
    outsider = User.objects.create_user("media-outsider@example.test", "password")
    other = APIClient()
    other.force_authenticate(outsider)
    assert other.get(f"/api/v1/admin/providers/{provider.pk}/image/").status_code == 403
    assert other.get(f"/api/v1/admin/providers/{provider.pk}/qr/").status_code == 403
    assert other.post(f"/api/v1/admin/providers/{provider.pk}/actions/rotate-qr/", {},
                      format="json", HTTP_IDEMPOTENCY_KEY="bad").status_code == 403
    assert client.get(f"/api/v1/admin/providers/{provider.pk}/image/").status_code == 404
    Provider.objects.filter(pk=provider.pk).update(image="providers/missing.png")
    assert client.get(f"/api/v1/admin/providers/{provider.pk}/image/").status_code == 404
    assert client.get("/api/v1/admin/dashboard/").status_code == 200


@pytest.mark.django_db(transaction=True)
def test_parallel_membership_keeps_one_business(admin_client):
    admin, client = admin_client
    owner = User.objects.create_user("parallel-owner@example.test", "password", role="PROVIDER")
    providers = [Provider.objects.create(slug=f"parallel-{number}", name=f"Provider {number}") for number in (1, 2)]
    versions = [client.get(f"/api/v1/admin/providers/{row.pk}/").data["version"] for row in providers]
    barrier = Barrier(2)

    def assign(index):
        close_old_connections()
        try:
            own = APIClient()
            own.force_authenticate(admin)
            barrier.wait(timeout=10)
            response = own.post(f"/api/v1/admin/providers/{providers[index].pk}/actions/assign-user/",
                                {"user_id": owner.pk, "version": versions[index]}, format="json",
                                HTTP_IDEMPOTENCY_KEY=f"parallel-{index}")
            return response.status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(assign, (0, 1)))
    assert sorted(statuses) == [200, 409]
    assert ProviderMembership.objects.filter(user=owner).count() == 1


@pytest.mark.django_db
def test_dashboard_queues_have_equivalent_filters_and_reject_bad_ids(admin_client):
    _, client = admin_client
    active = User.objects.create_user("active-referrer@example.test", "password", role="COLLABORATOR")
    inactive = User.objects.create_user("inactive-referrer@example.test", "password", role="COLLABORATOR",
                                        is_active=False)
    CollaboratorProfile.objects.create(user=active, enabled=True)
    CollaboratorProfile.objects.create(user=inactive, enabled=True)
    live = Provider.objects.create(slug="live", name="Live", status="PUBLISHED")
    Benefit.objects.create(provider=live, title="Available", conditions="Condition", status="PUBLISHED")
    Benefit.objects.create(provider=live, title="Draft", status="DRAFT")
    Product.objects.create(name="No stock", active=True, stock=0, price_credits=5)
    Product.objects.create(name="Hidden stock", active=False, stock=0, price_credits=5)
    customer = User.objects.create_user("queue-customer@example.test", "password", email_verified=True)
    consumption = Consumption.objects.create(tourist=customer, provider=live, award=10,
                                             rule_snapshot={"source": "global", "amount": 10})
    AdjustmentCase.objects.create(consumption=consumption, shortfall=10)
    dashboard = client.get("/api/v1/admin/dashboard/").data
    assert client.get("/api/v1/admin/benefits/?current=true").data["count"] == dashboard["counts"]["current_benefits"]
    assert client.get("/api/v1/admin/collaborators/?enabled=true&user_active=true").data["count"] == dashboard["counts"]["enabled_collaborators"]
    assert client.get("/api/v1/admin/products/?active=true&stock=0").data["count"] == dashboard["queues"]["out_of_stock_products"]
    assert client.get("/api/v1/admin/adjustments/?resolved=false").data["count"] == dashboard["queues"]["unresolved_adjustments"]
    for path in ("benefits/?provider=no-uuid", "consumptions/?tourist=abc", "orders/?created_from=bad",
                 "collaborators/?user_active=maybe", "products/?stock=other", "adjustments/?resolved=maybe"):
        assert client.get("/api/v1/admin/" + path).status_code == 400


@pytest.mark.django_db
def test_demo_and_provenance_cannot_be_rewritten_from_panel(admin_client):
    _, client = admin_client
    provider = Provider.objects.create(slug="demo-immutable", name="Synthetic", demo=True,
                                       provenance="https://example.test/source")
    detail = client.get(f"/api/v1/admin/providers/{provider.pk}/").data
    path = f"/api/v1/admin/providers/{provider.pk}/"
    for field, value in (("demo", False), ("provenance", "")):
        assert client.patch(path, {field: value, "version": detail["version"]}, format="json").status_code == 400
    assert client.post("/api/v1/admin/benefits/", {"provider": str(provider.pk), "title": "Invalid",
                                                     "demo": False}, format="json").status_code == 400
    created = client.post("/api/v1/admin/benefits/", {"provider": str(provider.pk), "title": "Inherited"}, format="json")
    assert created.status_code == 201 and created.data["demo"] is True
    assert Benefit.objects.get(pk=created.data["id"]).demo is True


@pytest.mark.django_db
def test_invalid_admin_image_does_not_create_provider(admin_client):
    _, client = admin_client
    image = SimpleUploadedFile("invalid.png", b"not an image", content_type="image/png")
    response = client.post("/api/v1/admin/providers/", {"slug": "image-invalid", "name": "Invalid", "image": image})
    assert response.status_code == 400
    assert not Provider.objects.filter(slug="image-invalid").exists()


@pytest.mark.django_db
def test_credit_rule_remove_and_unpublished_selection_rejected(admin_client):
    _, client = admin_client
    provider = Provider.objects.create(slug="credit-rule-provider", name="Credits", status="PUBLISHED")
    created = client.post("/api/v1/admin/credit-rules/", {"provider": str(provider.pk), "reward": 750}, format="json")
    assert created.status_code == 201
    rule_id = created.data["id"]
    changed = client.patch(f"/api/v1/admin/credit-rules/{rule_id}/",
                           {"reward": 800, "version": created.data["version"]}, format="json")
    assert changed.status_code == 200
    assert client.patch(f"/api/v1/admin/credit-rules/{rule_id}/",
                        {"reward": 900, "version": created.data["version"]}, format="json").status_code == 409
    removed = client.post(f"/api/v1/admin/credit-rules/{rule_id}/actions/remove/",
                          {"version": changed.data["version"]}, format="json", HTTP_IDEMPOTENCY_KEY="rule-remove")
    assert removed.status_code == 200 and removed.data["removed"] is True
    assert client.post(f"/api/v1/admin/credit-rules/{rule_id}/actions/remove/",
                       {"version": changed.data["version"]}, format="json", HTTP_IDEMPOTENCY_KEY="rule-remove").status_code == 200
    collaborator = User.objects.create_user("no-draft-selection@example.test", "password", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    draft = Benefit.objects.create(provider=provider, title="Draft")
    version = client.get(f"/api/v1/admin/collaborators/{profile.pk}/").data["version"]
    response = client.post(f"/api/v1/admin/collaborators/{profile.pk}/actions/add-benefit/",
                           {"benefit_id": str(draft.pk), "version": version}, format="json",
                           HTTP_IDEMPOTENCY_KEY="draft-attempt")
    assert response.status_code == 409
    assert not FolderBenefit.objects.filter(collaborator=profile).exists()


@pytest.mark.django_db
def test_related_versions_block_new_key_after_external_credential_membership_and_selection(admin_client):
    _, client = admin_client
    provider = Provider.objects.create(slug="related-version", name="Related", status="PUBLISHED")
    user = User.objects.create_user("related-owner@example.test", "password", role="PROVIDER")
    base = client.get(f"/api/v1/admin/providers/{provider.pk}/").data["version"]
    pin_url = f"/api/v1/admin/providers/{provider.pk}/actions/set-pin/"
    first = client.post(pin_url, {"pin": "111111", "version": base}, format="json", HTTP_IDEMPOTENCY_KEY="related-pin-1")
    assert first.status_code == 200
    assert client.post(pin_url, {"pin": "111111", "version": base}, format="json",
                       HTTP_IDEMPOTENCY_KEY="related-pin-1").data == first.data
    assert client.post(pin_url, {"pin": "222222", "version": base}, format="json",
                       HTTP_IDEMPOTENCY_KEY="related-pin-2").status_code == 409
    ProviderMembership.objects.create(user=user, provider=provider)
    assert client.patch(f"/api/v1/admin/providers/{provider.pk}/",
                        {"name": "Overwritten", "version": client.get(f"/api/v1/admin/providers/{provider.pk}/").data["version"]},
                        format="json").status_code == 200
    after_membership = client.get(f"/api/v1/admin/providers/{provider.pk}/").data["version"]
    ProviderMembership.objects.filter(user=user).delete()
    assert client.patch(f"/api/v1/admin/providers/{provider.pk}/",
                        {"name": "Stale", "version": after_membership}, format="json").status_code == 409

    referrer = User.objects.create_user("related-referrer@example.test", "password", role="COLLABORATOR")
    profile = CollaboratorProfile.objects.create(user=referrer, enabled=True)
    benefit = Benefit.objects.create(provider=provider, title="Offer", conditions="Terms", status="PUBLISHED")
    old = client.get(f"/api/v1/admin/collaborators/{profile.pk}/").data["version"]
    add_url = f"/api/v1/admin/collaborators/{profile.pk}/actions/add-benefit/"
    added = client.post(add_url, {"benefit_id": str(benefit.pk), "version": old}, format="json",
                        HTTP_IDEMPOTENCY_KEY="related-select-1")
    assert added.status_code == 200
    assert client.post(add_url, {"benefit_id": str(benefit.pk), "version": old}, format="json",
                       HTTP_IDEMPOTENCY_KEY="related-select-1").data == added.data
    assert client.post(f"/api/v1/admin/collaborators/{profile.pk}/actions/remove-benefit/",
                       {"benefit_id": str(benefit.pk), "version": old}, format="json",
                       HTTP_IDEMPOTENCY_KEY="related-select-2").status_code == 409
    fresh = client.get(f"/api/v1/admin/collaborators/{profile.pk}/").data["version"]
    FolderBenefit.objects.filter(collaborator=profile).delete()
    assert client.patch(f"/api/v1/admin/collaborators/{profile.pk}/",
                        {"network_title": "Stale", "version": fresh}, format="json").status_code == 409
