from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Barrier

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connection, connections, transaction
from django.db.migrations.executor import MigrationExecutor
from PIL import Image
from rest_framework.exceptions import APIException
from rest_framework.test import APIClient

from accounts.models import User
from credits.services import credit_wallet
from shop.models import Product, ProductCategory, ShopSettings
from shop.services import checkout

pytestmark = pytest.mark.django_db(transaction=True)


def test_category_migration_preserves_existing_products_and_order():
    old_target = [("shop", "0005_payment_confirmation_history")]
    new_target = [("shop", "0006_product_categories")]
    MigrationExecutor(connection).migrate(old_target)
    try:
        apps = MigrationExecutor(connection).loader.project_state(old_target).apps
        old_product = apps.get_model("shop", "Product").objects.create(
            name="Conservado", active=True, stock=7, price_money="12.50", price_credits=8)
        apps.get_model("shop", "ShopSettings").objects.create(pickup_name="Existente")
        user = User.objects.create_user("migration-shop@example.test", "password")
        with transaction.atomic():
            old_order = apps.get_model("shop", "Order").objects.create(
                customer_id=user.pk, mode="CREDITS", state="PAID", total_credits=8,
                pickup_snapshot={"name": "Original"})
            apps.get_model("shop", "OrderLine").objects.create(order_id=old_order.pk, product_id=old_product.pk,
                name="Conservado", quantity=1, unit_credits=8)
            apps.get_model("shop", "CheckoutKey").objects.create(actor_id=user.pk, order_id=old_order.pk,
                key="migracion", fingerprint="a" * 64)
        MigrationExecutor(connection).migrate(new_target)
        product = Product.objects.get(pk=old_product.pk)
        assert (product.category_id, product.stock, product.active, str(product.price_money), product.price_credits) == (None, 7, True, "12.50", 8)
        settings = ShopSettings.objects.get(pk=1)
        assert settings.pickup_name == "Existente" and settings.low_stock_threshold == 5
        apps = MigrationExecutor(connection).loader.project_state(new_target).apps
        assert apps.get_model("shop", "Order").objects.get(pk=old_order.pk).pickup_snapshot == {"name": "Original"}
    finally:
        MigrationExecutor(connection).migrate(new_target)


def client_for(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


def test_categories_visibility_metadata_detail_and_pickup():
    category = ProductCategory.objects.create(name="Recuerdos")
    image = BytesIO()
    Image.new("RGB", (2, 2)).save(image, format="PNG")
    product = Product.objects.create(name="A", category=category, active=True, stock=0, price_credits=5,
                                     image=SimpleUploadedFile("prueba.png", image.getvalue(), content_type="image/png"))
    Product.objects.create(name="B", active=True, price_money=10)
    hidden = ProductCategory.objects.create(name="Oculta", active=False)
    Product.objects.create(name="C", category=hidden, active=True, price_credits=1)
    ShopSettings.objects.create(pickup_enabled=True, pickup_name="Punto", pickup_address="Calle", pickup_hours="9 a 18")
    client = client_for()
    data = client.get("/api/v1/shop/catalog/").data
    assert [row["name"] for row in data["categories"]] == ["Recuerdos"]
    assert data["pickup"] == {"name": "Punto", "address": "Calle", "hours": "9 a 18"}
    assert client.get("/api/v1/shop/products/").data["count"] == 2
    assert client.get(f"/api/v1/shop/products/{product.pk}/").status_code == 200
    response = client.get(f"/api/v1/shop/products/{product.pk}/media/")
    assert response.status_code == 200
    response.close()
    category.active = False
    category.save()
    assert client.get(f"/api/v1/shop/products/{product.pk}/").status_code == 404
    assert client.get(f"/api/v1/shop/products/{product.pk}/media/").status_code == 404
    assert client.get("/api/v1/shop/catalog/").data["categories"] == []
    category.active = True
    category.save()
    assert client.get(f"/api/v1/shop/products/{product.pk}/").status_code == 200
    product.image.delete(save=False)


def test_filters_order_pagination_and_admin_permissions():
    admin = User.objects.create_superuser("shop-admin@example.test", "password")
    category = ProductCategory.objects.create(name="Arte")
    for i in range(22):
        Product.objects.create(name=f"Producto {i:02}", description="Arte", category=category,
                               active=True, stock=i, price_credits=10)
    later = ProductCategory.objects.create(name="Zeta")
    Product.objects.create(name="Zeta", category=later, active=True, stock=1, price_credits=10)
    client = client_for(admin)
    url = "/api/v1/admin/products/"
    response = client.get(url, {"category": str(category.pk), "availability": "low", "ordering": "-name"})
    assert response.status_code == 200
    assert response.data["count"] == 5
    assert response.data["results"][0]["name"] == "Producto 05"
    assert client.get(url, {"ordering": "unknown"}).status_code == 400
    page = client.get(url, {"ordering": "name", "page": 2})
    assert page.data["count"] == 23
    assert len(page.data["results"]) == 3
    public = client_for().get("/api/v1/shop/products/", {"category": str(category.pk), "ordering": "-name", "page_size": 6})
    assert public.data["count"] == 22
    assert public.data["results"][0]["name"] == "Producto 21"
    assert len(public.data["results"]) == 6
    assert {item["name"] for item in client_for().get("/api/v1/shop/catalog/").data["categories"]} == {"Arte", "Zeta"}
    assert client_for().get("/api/v1/admin/product-categories/").status_code in (401, 403)


def test_category_uniqueness_versions_and_draft_prices():
    admin = User.objects.create_superuser("shop-admin2@example.test", "password")
    client = client_for(admin)
    url = "/api/v1/admin/product-categories/"
    first = client.post(url, {"name": "  Regalos  ", "active": True}, format="json")
    assert first.status_code == 201
    assert client.post(url, {"name": "regalos"}, format="json").status_code in (400, 409)
    pk, version = first.data["id"], first.data["version"]
    assert client.patch(f"{url}{pk}/", {"version": version, "active": False}, format="json").status_code == 200
    assert client.patch(f"{url}{pk}/", {"version": version, "active": True}, format="json").status_code == 409
    products = "/api/v1/admin/products/"
    assert client.post(products, {"name": "A", "active": True, "price_credits": 5}, format="json").status_code == 400
    assert client.post(products, {"name": "A"}, format="json").status_code == 400
    created = client.post(products, {"name": "A", "price_credits": 5}, format="json")
    assert created.status_code == 201
    assert created.data["active"] is False and created.data["stock"] == 0


@pytest.mark.parametrize("endpoint", ["/api/v1/admin/products/", "/api/v1/shop/products/"])
@pytest.mark.parametrize("field", ["price_money", "price_credits"])
@pytest.mark.parametrize("descending", [False, True])
def test_price_order_places_missing_prices_last(endpoint, field, descending):
    admin = User.objects.create_superuser("order-shop@example.test", "password")
    values = [{"price_money": 10, "price_credits": 10}, {"price_money": 20, "price_credits": 20}]
    if field == "price_money":
        values.append({"price_money": None, "price_credits": 5})
    else:
        values.append({"price_money": 5, "price_credits": None})
    for index, prices in enumerate(values):
        Product.objects.create(name=f"Producto {index}", active=True, **prices)
    client = client_for(admin) if "/admin/" in endpoint else client_for()
    ordering = ("-" if descending else "") + field
    response = client.get(endpoint, {"ordering": ordering, "page_size": 2})
    assert response.status_code == 200
    assert [row["name"] for row in response.data["results"]] == (["Producto 1", "Producto 0"] if descending else ["Producto 0", "Producto 1"])
    last = client.get(endpoint, {"ordering": ordering, "page_size": 2, "page": 2})
    assert [row["name"] for row in last.data["results"]] == ["Producto 2"]


def test_category_count_and_product_related_state_in_versions():
    admin = User.objects.create_superuser("shop-version@example.test", "password")
    client = client_for(admin)
    category = ProductCategory.objects.create(name="Original")
    product = Product.objects.create(name="Borrador", category=category, active=False, price_credits=10)
    category_url = f"/api/v1/admin/product-categories/{category.pk}/"
    product_url = f"/api/v1/admin/products/{product.pk}/"
    category_data = client.get(category_url).data
    product_data = client.get(product_url).data
    assert category_data["published_products_count"] == 0
    assert client.patch(product_url, {"version": product_data["version"], "active": True}, format="json").status_code == 200
    assert client.patch(category_url, {"version": category_data["version"], "active": False}, format="json").status_code == 409
    product_data = client.get(product_url).data
    category_data = client.get(category_url).data
    assert category_data["published_products_count"] == 1
    assert client.patch(category_url, {"version": category_data["version"], "name": "Renombrada"}, format="json").status_code == 200
    assert client.patch(product_url, {"version": product_data["version"], "name": "Nuevo"}, format="json").status_code == 409
    assert client.post(product_url + "actions/adjust-stock/", {"version": product_data["version"], "delta": 1, "reason": "Ingreso"}, format="json", HTTP_IDEMPOTENCY_KEY="stale-category").status_code == 409


def test_publish_races_category_deactivation():
    admin = User.objects.create_superuser("shop-race-admin@example.test", "password")
    category = ProductCategory.objects.create(name="Carrera de publicación")
    product = Product.objects.create(name="Borrador", category=category, price_credits=10)
    client = client_for(admin)
    category_url = f"/api/v1/admin/product-categories/{category.pk}/"
    product_url = f"/api/v1/admin/products/{product.pk}/"
    category_version = client.get(category_url).data["version"]
    product_version = client.get(product_url).data["version"]
    barrier = Barrier(2)

    def change(url, body):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return client_for(admin).patch(url, body, format="json").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(change, product_url, {"version": product_version, "active": True})
        second = executor.submit(change, category_url, {"version": category_version, "active": False})
        assert sorted([first.result(timeout=20), second.result(timeout=20)]) == [200, 409]


def test_checkout_and_category_deactivation_serialize():
    admin = User.objects.create_superuser("shop-admin3@example.test", "password")
    customer = User.objects.create_user("shop-buyer@example.test", "password", email_verified=True)
    with transaction.atomic():
        credit_wallet(customer.pk, 100, "category-race-fixture")
    category = ProductCategory.objects.create(name="Carrera")
    product = Product.objects.create(name="Producto", category=category, active=True, stock=2, price_credits=10)
    ShopSettings.objects.create(pickup_enabled=True, pickup_name="Punto", pickup_address="Calle", pickup_hours="9 a 18")
    version = client_for(admin).get(f"/api/v1/admin/product-categories/{category.pk}/").data["version"]
    barrier = Barrier(2)

    def buy():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            try:
                checkout(customer.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}], idempotency_key="race")
                return 201
            except APIException as exc:
                return exc.status_code
        finally:
            connections.close_all()

    def disable():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return client_for(admin).patch(f"/api/v1/admin/product-categories/{category.pk}/", {"version": version, "active": False}, format="json").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first, second = executor.submit(buy), executor.submit(disable)
        assert first.result(timeout=20) in (201, 409)
        assert second.result(timeout=20) == 200
    with pytest.raises(APIException):
        checkout(customer.pk, mode="CREDITS", items=[{"product_id": str(product.pk), "quantity": 1}], idempotency_key="after")
