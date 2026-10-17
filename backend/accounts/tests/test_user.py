import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import override_settings

User = get_user_model()


@pytest.mark.django_db
def test_email_is_normalized_and_password_is_hashed():
    user = User.objects.create_user(" TURISTA@Example.Test ", "Secreto-123")
    assert user.email == "turista@example.test"
    assert user.check_password("Secreto-123")
    assert user.password != "Secreto-123"


@pytest.mark.django_db
def test_email_uniqueness_is_case_insensitive():
    User.objects.create_user("Persona@example.test", "Secreto-123")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user("PERSONA@EXAMPLE.TEST", "Otro-123")


@pytest.mark.django_db
def test_superuser_is_an_admin_and_staff():
    user = User.objects.create_superuser("admin@example.test", "Secreto-123")
    assert user.role == User.Role.ADMIN
    assert user.is_staff and user.is_superuser


@pytest.mark.django_db
def test_seed_demo_is_idempotent_and_keeps_existing_password(tmp_path):
    destination = tmp_path / "docs" / "accounts.md"
    with override_settings(DEBUG=True, DEMO_CREDENTIALS_PATH=destination):
        call_command("seed_demo", verbosity=0)
        user = User.objects.get(email="turista@llaveextra.test")
        original_password = user.password
        call_command("seed_demo", verbosity=0)
    user.refresh_from_db()
    assert user.password == original_password
    assert destination.exists()
    assert User.objects.count() == 6
    assert User.objects.get(email="prestador.tiger@llaveextra.test").role == User.Role.PROVIDER
    assert User.objects.get(email="colaborador@llaveextra.test").role == User.Role.COLLABORATOR
    assert User.objects.get(email="turista.pendiente@llaveextra.test").role == User.Role.TOURIST


@pytest.mark.django_db
def test_seed_demo_refuses_production_settings():
    with override_settings(DEBUG=False), pytest.raises(CommandError):
        call_command("seed_demo")
