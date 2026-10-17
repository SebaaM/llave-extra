import pytest
from django.db import DatabaseError
from django.test import Client


@pytest.mark.django_db
def test_health_checks_database(client: Client):
    response = client.get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_health_hides_database_errors(client: Client, monkeypatch):
    def unavailable(*args, **kwargs):
        raise DatabaseError("private database detail")

    class BrokenConnections:
        def __getitem__(self, key):
            return unavailable()

    monkeypatch.setattr("config.health.connections", BrokenConnections())
    response = client.get("/api/v1/health/")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert b"private database detail" not in response.content
