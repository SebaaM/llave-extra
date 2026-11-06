from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Event
from time import monotonic

import pytest
from django.contrib import admin
from django.db import connection, connections, transaction
from django.test import RequestFactory
from django.urls import resolve
from rest_framework.test import APIClient

from accounts import views
from accounts.models import AuthSession, User

PASSWORD = "Test-Password-789!"


@pytest.mark.django_db(transaction=True)
def test_login_authenticated_before_admin_deactivation_cannot_issue_session_afterward(monkeypatch):
    technical_admin = User.objects.create_superuser("technical-admin@example.test", PASSWORD)
    user = User.objects.create_user("login-deactivation@example.test", PASSWORD)
    authenticated = Event()
    admin_committed = Event()
    worker_pid: Queue[int] = Queue()
    original_authenticate = views.authenticate
    login_path = "/api/v1/auth/login/"
    resolve(login_path)

    def signal_after_authenticate(*args, **kwargs):
        result = original_authenticate(*args, **kwargs)
        authenticated.set()
        assert admin_committed.wait(timeout=30)
        return result

    monkeypatch.setattr(views, "authenticate", signal_after_authenticate)

    def login_from_other_connection():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '40s'")
                cursor.execute("SELECT pg_backend_pid()")
                worker_pid.put(cursor.fetchone()[0])
            response = APIClient().post(
                login_path,
                {"email": user.email, "password": PASSWORD},
                format="json",
            )
            return response.status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        try:
            with transaction.atomic():
                User.objects.select_for_update().get(pk=user.pk)
                result = pool.submit(login_from_other_connection)
                pid = worker_pid.get(timeout=10)

                deadline = monotonic() + 20
                while not authenticated.is_set():
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT pg_backend_pid() = ANY(pg_blocking_pids(%s))", [pid])
                        if cursor.fetchone()[0]:
                            break
                    if result.done():
                        pytest.fail(f"el login terminó antes de la desactivación: {result.result()}")
                    if monotonic() >= deadline:
                        pytest.fail("el login no llegó a autenticar ni esperó el lock del usuario")
                    authenticated.wait(timeout=0.02)

                user.is_active = False
                request = RequestFactory().post(f"/admin/accounts/user/{user.pk}/change/")
                request.user = technical_admin
                admin.site._registry[User].save_model(request, user, form=None, change=True)
        finally:
            admin_committed.set()
        assert result.result(timeout=30) == 401

    assert not AuthSession.objects.filter(user=user).exists()
