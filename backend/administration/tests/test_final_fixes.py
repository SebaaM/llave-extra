from datetime import date
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext
from drf_spectacular.generators import SchemaGenerator
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import User
from administration.models import AdminAudit, AdminCommand
from administration.views import validate_model
from credits.services import credit_wallet
from providers.models import Benefit, Provider
from shop.models import OrderAudit, Product, ShopSettings
from shop.services import checkout

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def admin_api():
    actor = User.objects.create_superuser('final-admin@example.test')
    api = APIClient()
    api.force_authenticate(actor)
    return actor, api


def make_order():
    customer = User.objects.create_user('final-customer@example.test', email_verified=True)
    with transaction.atomic():
        credit_wallet(customer.pk, 1000, 'fixture:final')
    product = Product.objects.create(name='Recuerdo', active=True, stock=2, price_credits=100)
    ShopSettings.objects.create(pickup_enabled=True, pickup_name='Punto', pickup_address='Calle', pickup_hours='9-18')
    return checkout(customer.pk, mode='CREDITS', items=[{'product_id': str(product.pk), 'quantity': 1}],
                    idempotency_key='final-order')[0]


def test_publication_requires_conditions_with_safe_field_error_and_no_effect(admin_api):
    _, api = admin_api
    provider = Provider.objects.create(slug='final-provider', name='Negocio')
    benefit = Benefit.objects.create(provider=provider, title='Oferta')
    url = f'/api/v1/admin/benefits/{benefit.pk}/'
    response = api.patch(url, {'version': api.get(url).data['version'], 'status': 'PUBLISHED'}, format='json')
    assert response.status_code == 400
    assert response.data == {'conditions': ['Completá las condiciones antes de publicar el beneficio.']}
    benefit.refresh_from_db()
    assert benefit.status == 'DRAFT'
    assert not AdminAudit.objects.exists()


def test_inverted_dates_report_both_fields_on_create_and_partial_patch(admin_api):
    _, api = admin_api
    provider = Provider.objects.create(slug='final-dates', name='Negocio')
    response = api.post('/api/v1/admin/benefits/', {'provider': str(provider.pk), 'title': 'Oferta',
                                                'valid_from': '2026-10-20', 'valid_until': '2026-10-01'}, format='json')
    assert response.status_code == 400
    assert set(response.data) == {'valid_from', 'valid_until'}
    assert 'posterior' in str(response.data['valid_from'])
    assert not Benefit.objects.exists()
    benefit = Benefit.objects.create(provider=provider, title='Oferta', valid_from=date(2026, 10, 20))
    url = f'/api/v1/admin/benefits/{benefit.pk}/'
    response = api.patch(url, {'version': api.get(url).data['version'], 'valid_until': '2026-10-01'}, format='json')
    assert response.status_code == 400 and set(response.data) == {'valid_from', 'valid_until'}
    benefit.refresh_from_db()
    assert benefit.valid_until is None


def test_multiple_invalid_config_fields_are_returned_together_without_values(admin_api):
    _, api = admin_api
    url = '/api/v1/admin/settings/catalog/'
    response = api.patch(url, {'version': api.get(url).data['version'], 'network_page_size': 99,
                               'network_interval_seconds': 999}, format='json')
    assert response.status_code == 400
    assert set(response.data) == {'network_page_size', 'network_interval_seconds'}
    assert '99' not in str(response.data) and not AdminAudit.objects.exists()


def test_multiple_action_errors_do_not_persist_a_command_or_stock_effect(admin_api):
    _, api = admin_api
    product = Product.objects.create(name='Recuerdo', active=True, stock=2, price_credits=100)
    version = api.get(f'/api/v1/admin/products/{product.pk}/').data['version']
    response = api.post(f'/api/v1/admin/products/{product.pk}/actions/adjust-stock/',
                        {'version': version, 'delta': 0, 'reason': ''}, format='json',
                        HTTP_IDEMPOTENCY_KEY='invalid-final-stock')
    assert response.status_code == 400 and set(response.data) == {'delta', 'reason'}
    assert str(response.data['delta'][0]) == 'La variación no puede ser cero.'
    product.refresh_from_db()
    assert product.stock == 2
    assert not AdminCommand.objects.exists() and not AdminAudit.objects.exists()


def test_unrecognized_model_errors_remain_sanitized():
    obj = Provider(slug='safe', name='Safe')
    with patch.object(obj, 'full_clean', side_effect=DjangoValidationError({'__all__': 'private SQL or credentials'})):
        with pytest.raises(ValidationError) as raised:
            validate_model(obj)
    assert raised.value.detail == {'non_field_errors': ['Valor inválido o conflicto de configuración.']}
    assert 'private' not in str(raised.value.detail)


def test_order_collection_is_summary_without_loading_histories_and_detail_is_complete(admin_api):
    _, api = admin_api
    order = make_order()
    with CaptureQueriesContext(connection) as captured:
        response = api.get('/api/v1/admin/orders/')
    assert response.status_code == 200
    assert set(response.data['results'][0]) == {'id', 'customer', 'customer_email', 'mode', 'state', 'currency',
                                             'total_money', 'total_credits', 'created_at'}
    for query in captured:
        assert all(table not in query['sql'] for table in ('shop_orderline', 'shop_orderaudit',
                                                          'shop_paymentoperation', 'shop_cancellationrequest'))
    detail = api.get(f'/api/v1/admin/orders/{order.pk}/').data
    assert detail['lines'][0]['name'] == 'Recuerdo'
    assert {'audit', 'cancellations', 'payment_operations', 'pickup_snapshot'} <= set(detail)


def test_activity_identity_discriminates_same_order_resource_and_id(admin_api):
    actor, api = admin_api
    order = make_order()
    domain = OrderAudit.objects.filter(order=order).first()
    AdminAudit.objects.create(id=domain.pk, actor=actor, action='orders.prepare', resource='orders',
                              object_id=str(order.pk), changed_fields=['state'])
    response = api.get('/api/v1/admin/activity/?resource=orders')
    assert response.status_code == 200
    rows = response.data['results']
    identities = {(row['source'], row['id']) for row in rows}
    assert ('admin', domain.pk) in identities and ('order', domain.pk) in identities
    assert len(identities) == len(rows)
    assert all(row['resource'] == 'orders' and row['object_id'] == str(order.pk) for row in rows)


def test_openapi_distinguishes_order_summary_and_activity_source():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    schemas = schema['components']['schemas']
    page = schemas['AdminOrdersPage']
    summary = schemas[page['properties']['results']['items']['$ref'].rsplit('/', 1)[-1]]
    assert 'lines' not in summary['properties']
    assert 'source' in schemas['AdminAudit']['properties']
