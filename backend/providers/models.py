import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q

from referrals.models import CollaboratorProfile

from .media import private_image_path, private_storage, validate_private_image


class Publication(models.TextChoices):
    DRAFT = "DRAFT", "Borrador"
    PUBLISHED = "PUBLISHED", "Publicado"
    INACTIVE = "INACTIVE", "Inactivo"


class Provider(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    legacy_public_id = models.CharField(max_length=32, unique=True, null=True, blank=True)
    slug = models.SlugField(max_length=160, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=250, blank=True)
    hours = models.CharField(max_length=250, blank=True)
    contact = models.CharField(max_length=150, blank=True)
    map_url = models.URLField(blank=True)
    website = models.URLField(blank=True)
    image = models.ImageField(upload_to=private_image_path, storage=private_storage, validators=[validate_private_image], blank=True)
    status = models.CharField(max_length=12, choices=Publication.choices, default=Publication.DRAFT)
    demo = models.BooleanField(default=False)
    provenance = models.URLField(blank=True)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.pk and not self._state.adding:
                type(self).objects.select_for_update().get(pk=self.pk)
            return super().save(*args, **kwargs)

    @classmethod
    def set_status(cls, pk, status):
        if status not in Publication.values:
            raise ValidationError("Estado inválido")
        with transaction.atomic():
            provider = cls.objects.select_for_update().get(pk=pk)
            provider.status = status
            provider.full_clean()
            provider.save(update_fields=["status"])


class ProviderMembership(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="provider_memberships")
    provider = models.ForeignKey(Provider, on_delete=models.PROTECT, related_name="memberships")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "provider"], name="unique_provider_membership")]

    def clean(self):
        if self.user.role != self.user.Role.PROVIDER:
            raise ValidationError("La membresía requiere rol prestador")


class FolderProvider(models.Model):
    collaborator = models.ForeignKey(CollaboratorProfile, on_delete=models.PROTECT, related_name="folder_providers")
    provider = models.ForeignKey(Provider, on_delete=models.PROTECT, related_name="folder_assignments")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["collaborator", "provider"], name="unique_folder_provider")]

    def save(self, *args, **kwargs):
        with transaction.atomic():
            CollaboratorProfile.objects.select_for_update().get(pk=self.collaborator_id)
            Provider.objects.select_for_update().get(pk=self.provider_id)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        with transaction.atomic():
            CollaboratorProfile.objects.select_for_update().get(pk=self.collaborator_id)
            Provider.objects.select_for_update().get(pk=self.provider_id)
            return super().delete(*args, **kwargs)

    @classmethod
    def assign(cls, profile_id, provider_id):
        with transaction.atomic():
            CollaboratorProfile.objects.select_for_update().get(pk=profile_id)
            Provider.objects.select_for_update().get(pk=provider_id)
            return cls.objects.get_or_create(collaborator_id=profile_id, provider_id=provider_id)

    @classmethod
    def remove(cls, profile_id, provider_id):
        with transaction.atomic():
            CollaboratorProfile.objects.select_for_update().get(pk=profile_id)
            Provider.objects.select_for_update().get(pk=provider_id)
            assignment = cls.objects.filter(collaborator_id=profile_id, provider_id=provider_id).first()
            if assignment:
                assignment.delete()


class Benefit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(Provider, on_delete=models.PROTECT, related_name="benefits")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    conditions = models.TextField(blank=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    image = models.ImageField(upload_to=private_image_path, storage=private_storage, validators=[validate_private_image], blank=True)
    status = models.CharField(max_length=12, choices=Publication.choices, default=Publication.DRAFT)
    demo = models.BooleanField(default=False)
    provenance = models.URLField(blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(valid_from__isnull=True) | Q(valid_until__isnull=True) | Q(valid_from__lte=models.F("valid_until")), name="benefit_valid_window"),
            models.CheckConstraint(condition=~Q(status=Publication.PUBLISHED) | (~Q(title="") & ~Q(conditions="")), name="published_benefit_complete"),
        ]

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.pk and not self._state.adding:
                type(self).objects.select_for_update().get(pk=self.pk)
            return super().save(*args, **kwargs)

    def clean(self):
        if self.valid_from and self.valid_until and self.valid_from > self.valid_until:
            raise ValidationError("La vigencia tiene fechas invertidas")
        if self.status == Publication.PUBLISHED and (not self.title.strip() or not self.conditions.strip()):
            raise ValidationError("La oferta publicada requiere título y condiciones")

    @classmethod
    def set_status(cls, pk, status):
        if status not in Publication.values:
            raise ValidationError("Estado inválido")
        with transaction.atomic():
            benefit = cls.objects.select_for_update().get(pk=pk)
            benefit.status = status
            benefit.full_clean()
            benefit.save(update_fields=["status"])


class DemoSeedState(models.Model):
    key = models.CharField(max_length=80, primary_key=True)
    loaded_at = models.DateTimeField(auto_now_add=True)


class CatalogConfig(models.Model):
    singleton = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    enabled = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Configuración del catálogo público"
        verbose_name_plural = "Configuración del catálogo público"
        constraints = [models.CheckConstraint(condition=Q(singleton=1), name="catalog_config_singleton")]

    def delete(self, *args, **kwargs):
        raise ValidationError("No se puede eliminar la configuración del catálogo")
