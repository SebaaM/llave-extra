from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("El email es obligatorio")
        email = self.normalize_email(email).strip().lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        role = extra_fields.setdefault("role", User.Role.ADMIN)
        if role != User.Role.ADMIN:
            raise ValueError("Un superusuario debe tener el rol ADMIN")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError("El administrador debe tener is_staff e is_superuser habilitados")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrador"
        PROVIDER = "PROVIDER", "Prestador"
        COLLABORATOR = "COLLABORATOR", "Colaborador"
        TOURIST = "TOURIST", "Turista"

    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.TOURIST)
    email_verified = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []
    objects = UserManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_uniq"),
            models.CheckConstraint(
                condition=models.Q(is_superuser=False) | models.Q(role="ADMIN"),
                name="accounts_superuser_requires_admin_role",
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_superuser and self.role != self.Role.ADMIN:
            raise ValidationError({"role": "Un superusuario debe tener el rol ADMIN."})

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.email
