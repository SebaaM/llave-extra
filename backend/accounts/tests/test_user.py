import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
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
def test_database_constraint_rejects_case_variant_bulk_create():
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.bulk_create(
            [
                User(email="Persona@example.test"),
                User(email="persona@example.test"),
            ]
        )


@pytest.mark.django_db
def test_superuser_is_an_admin_and_staff():
    user = User.objects.create_superuser("admin@example.test", "Secreto-123")
    assert user.role == User.Role.ADMIN
    assert user.is_staff and user.is_superuser


@pytest.mark.django_db
def test_superuser_must_have_admin_role():
    with pytest.raises(ValueError, match="rol ADMIN"):
        User.objects.create_superuser("wrong-role@example.test", "Secreto-123", role=User.Role.TOURIST)

    user = User.objects.create_user("custom@example.test", "Secreto-123")
    user.is_superuser = True
    with pytest.raises(ValidationError, match="rol ADMIN"):
        user.full_clean()

    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.filter(pk=user.pk).update(is_superuser=True)


@pytest.mark.django_db
def test_seed_demo_is_idempotent_and_keeps_existing_password(tmp_path):
    destination = tmp_path / "docs" / "accounts.md"
    admin_password = "Custom-Admin-123"
    User.objects.create_user(
        "admin@llaveextra.test",
        admin_password,
        role=User.Role.ADMIN,
        is_staff=True,
        is_superuser=True,
    )
    existing_entry = f"- `admin@llaveextra.test` — contraseña: `{admin_password}`"
    destination.parent.mkdir(parents=True)
    destination.write_text(f"# Cuentas\n\n{existing_entry}\n", encoding="utf-8")
    with override_settings(DEBUG=True, DEMO_CREDENTIALS_PATH=destination):
        call_command("seed_demo", verbosity=0)
        admin = User.objects.get(email="admin@llaveextra.test")
        original_password = admin.password
        file_after_first = destination.read_text(encoding="utf-8")
        call_command("seed_demo", verbosity=0)
    admin.refresh_from_db()
    assert admin.password == original_password
    assert admin.check_password(admin_password)
    assert destination.read_text(encoding="utf-8") == file_after_first
    assert existing_entry in file_after_first
    assert destination.exists()
    assert User.objects.count() == 7
    assert "turista@llaveextra.test" in file_after_first
    assert User.objects.get(email="prestador.tiger@llaveextra.test").role == User.Role.PROVIDER
    assert User.objects.get(email="colaborador@llaveextra.test").role == User.Role.COLLABORATOR
    assert User.objects.get(email="colaborador.secundario@llaveextra.test").role == User.Role.COLLABORATOR
    assert User.objects.get(email="turista.pendiente@llaveextra.test").role == User.Role.TOURIST


@pytest.mark.django_db
def test_seed_demo_missing_file_requires_explicit_recovery(tmp_path):
    destination = tmp_path / "accounts.md"
    with override_settings(DEBUG=True, DEMO_CREDENTIALS_PATH=destination):
        call_command("seed_demo", verbosity=0)
        prior_passwords = dict(User.objects.values_list("email", "password"))
        destination.unlink()

        with pytest.raises(CommandError, match="--recover-missing"):
            call_command("seed_demo", verbosity=0)
        assert dict(User.objects.values_list("email", "password")) == prior_passwords

        call_command("seed_demo", "--recover-missing", verbosity=0)
        assert destination.exists()
        assert len(destination.read_text(encoding="utf-8").splitlines()) >= 10
        assert all(
            User.objects.get(email=email).password != password
            for email, password in prior_passwords.items()
        )


@pytest.mark.django_db
def test_seed_demo_refuses_production_settings():
    with override_settings(DEBUG=False), pytest.raises(CommandError):
        call_command("seed_demo")
