from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic, sleep

import pytest
from django.db import connection, connections, transaction
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_session
from credits.models import ProviderConsumptionCredential
from credits.services import set_provider_pin
from providers.models import Provider, ProviderMembership


@pytest.mark.django_db(transaction=True)
def test_provider_pin_write_denied_after_concurrent_membership_revocation():
    owner = User.objects.create_user("pin-owner@example.test", role=User.Role.PROVIDER)
    provider = Provider.objects.create(slug="pin-membership-race", name="Comercio de prueba")
    membership = ProviderMembership.objects.create(user=owner, provider=provider)
    set_provider_pin(provider.pk, "123456")
    credential = ProviderConsumptionCredential.objects.get(provider=provider)
    original_hash = credential.pin_hash
    token, _ = issue_session(owner)
    path = f"/api/v1/provider/providers/{provider.pk}/consumption-credential/"
    worker_pid: Queue[int] = Queue()

    def change_pin():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '12s'")
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            return client.put(path, {"pin": "654321"}, format="json").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=owner.pk)
            Provider.objects.select_for_update().get(pk=provider.pk)
            result = pool.submit(change_pin)
            pid = worker_pid.get(timeout=8)
            deadline = monotonic() + 8
            while monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_backend_pid() = ANY(pg_blocking_pids(%s))", [pid])
                    if cursor.fetchone()[0]:
                        break
                sleep(0.02)
            else:
                pytest.fail("El cambio de PIN no esperó el lock de la transacción que revoca la membresía")
            membership.delete()
        status = result.result(timeout=8)

    credential.refresh_from_db()
    assert (status, credential.pin_hash == original_hash) == (404, True)
