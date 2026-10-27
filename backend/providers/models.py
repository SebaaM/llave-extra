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
    id = models.UUIDField("Identificador", primary_key=True, default=uuid.uuid4, editable=False)
    legacy_public_id = models.CharField("Identificador público anterior", max_length=32, unique=True, null=True, blank=True)
    slug = models.SlugField("Identificador URL", max_length=160, unique=True)
    name = models.CharField("Nombre", max_length=200)
    category = models.CharField("Categoría", max_length=100, blank=True)
    description = models.TextField("Descripción", blank=True)
    address = models.CharField("Dirección", max_length=250, blank=True)
    hours = models.CharField("Horario", max_length=250, blank=True)
    contact = models.CharField("Contacto", max_length=150, blank=True)
    map_url = models.URLField("Enlace al mapa", blank=True)
    website = models.URLField("Sitio web", blank=True)
    image = models.ImageField("Imagen", upload_to=private_image_path, storage=private_storage, validators=[validate_private_image], blank=True)
    status = models.CharField("Estado", max_length=12, choices=Publication.choices, default=Publication.DRAFT)
    demo = models.BooleanField("Datos de prueba", default=False)
    provenance = models.URLField("Fuente", blank=True)

    class Meta:
        verbose_name = "Prestador"
        verbose_name_plural = "Prestadores"

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
    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Usuario de prestador", on_delete=models.PROTECT, related_name="provider_memberships")
    provider = models.ForeignKey(Provider, verbose_name="Prestador", on_delete=models.PROTECT, related_name="memberships")

    class Meta:
        verbose_name = "Usuario de prestador"
        verbose_name_plural = "Usuarios de prestadores"
        constraints = [
            models.UniqueConstraint(fields=["user", "provider"], name="unique_provider_membership"),
            models.UniqueConstraint(fields=["user"], name="unique_provider_membership_user"),
        ]

    def __str__(self):
        return f"{self.user} — {self.provider}"

    def clean(self):
        if self.user.role != self.user.Role.PROVIDER:
            raise ValidationError("La membresía requiere rol prestador")


class FolderProvider(models.Model):
    collaborator = models.ForeignKey(CollaboratorProfile, verbose_name="Colaborador", on_delete=models.PROTECT, related_name="folder_providers")
    provider = models.ForeignKey(Provider, verbose_name="Prestador recomendado", on_delete=models.PROTECT, related_name="folder_assignments")

    class Meta:
        verbose_name = "Prestador recomendado"
        verbose_name_plural = "Prestadores recomendados"
        constraints = [models.UniqueConstraint(fields=["collaborator", "provider"], name="unique_folder_provider")]

    def __str__(self):
        return f"{self.provider} — carpeta de {self.collaborator}"

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
    id = models.UUIDField("Identificador", primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(Provider, verbose_name="Prestador", on_delete=models.PROTECT, related_name="benefits")
    title = models.CharField("Título", max_length=200)
    description = models.TextField("Descripción", blank=True)
    conditions = models.TextField("Condiciones", blank=True)
    valid_from = models.DateField("Vigente desde", null=True, blank=True)
    valid_until = models.DateField("Vigente hasta", null=True, blank=True)
    image = models.ImageField("Imagen", upload_to=private_image_path, storage=private_storage, validators=[validate_private_image], blank=True)
    status = models.CharField("Estado", max_length=12, choices=Publication.choices, default=Publication.DRAFT)
    demo = models.BooleanField("Datos de prueba", default=False)
    provenance = models.URLField("Fuente", blank=True)

    class Meta:
        verbose_name = "Beneficio"
        verbose_name_plural = "Beneficios"
        constraints = [
            models.CheckConstraint(condition=Q(valid_from__isnull=True) | Q(valid_until__isnull=True) | Q(valid_from__lte=models.F("valid_until")), name="benefit_valid_window"),
            models.CheckConstraint(condition=~Q(status=Publication.PUBLISHED) | (~Q(title="") & ~Q(conditions="")), name="published_benefit_complete"),
        ]

    def __str__(self):
        return f"{self.title} — {self.provider}"

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


class FolderBenefit(models.Model):
    collaborator = models.ForeignKey(CollaboratorProfile, verbose_name="Colaborador", on_delete=models.PROTECT, related_name="folder_benefits")
    benefit = models.ForeignKey(Benefit, verbose_name="Beneficio recomendado", on_delete=models.PROTECT, related_name="folder_selections")
    created_at = models.DateTimeField("Fecha de selección", auto_now_add=True)

    class Meta:
        verbose_name = "Beneficio recomendado"
        verbose_name_plural = "Beneficios recomendados"
        constraints = [models.UniqueConstraint(fields=["collaborator", "benefit"], name="unique_folder_benefit")]

    def __str__(self):
        return f"{self.benefit} — carpeta de {self.collaborator}"

    @staticmethod
    def lock_target(profile_id, benefit_id):
        """Caller holds a transaction: profile -> provider -> benefit, as in E4.

        The first benefit read only locates its immutable provider. No joined
        User locks are acquired after the profile (PostgreSQL OF self).
        """
        CollaboratorProfile.objects.select_for_update(of=("self",)).get(pk=profile_id)
        provider_id = Benefit.objects.values_list("provider_id", flat=True).get(pk=benefit_id)
        Provider.objects.select_for_update().get(pk=provider_id)
        return Benefit.objects.select_for_update().get(pk=benefit_id, provider_id=provider_id)

    def clean(self):
        if self.pk:
            original = type(self).objects.filter(pk=self.pk).values("collaborator_id", "benefit_id").first()
            if original and (original["collaborator_id"] != self.collaborator_id or original["benefit_id"] != self.benefit_id):
                raise ValidationError("No se puede reasignar una selección existente; quitá y agregá la selección")

    def save(self, *args, **kwargs):
        with transaction.atomic():
            self.lock_target(self.collaborator_id, self.benefit_id)
            self.clean()
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        with transaction.atomic():
            self.lock_target(self.collaborator_id, self.benefit_id)
            return super().delete(*args, **kwargs)

    @classmethod
    def assign(cls, profile_id, benefit_id):
        with transaction.atomic():
            cls.lock_target(profile_id, benefit_id)
            return cls.objects.get_or_create(collaborator_id=profile_id, benefit_id=benefit_id)

    @classmethod
    def remove(cls, profile_id, benefit_id):
        with transaction.atomic():
            cls.lock_target(profile_id, benefit_id)
            cls.objects.filter(collaborator_id=profile_id, benefit_id=benefit_id).delete()


class DemoSeedState(models.Model):
    key = models.CharField(max_length=80, primary_key=True)
    loaded_at = models.DateTimeField(auto_now_add=True)


class CatalogConfig(models.Model):
    class NetworkLayout(models.TextChoices):
        RADIAL = "RADIAL", "Radial"
        ORBIT = "ORBIT", "Órbita"

    class NetworkTheme(models.TextChoices):
        SAND = "SAND", "Arena"
        OCEAN = "OCEAN", "Océano"

    class NetworkBackground(models.TextChoices):
        HARBOR = "HARBOR", "Puerto"
        BEAGLE = "BEAGLE", "Canal Beagle"

    singleton = models.PositiveSmallIntegerField("Identificador de configuración", primary_key=True, default=1, editable=False)
    enabled = models.BooleanField("Catálogo público habilitado", default=True)
    network_title = models.CharField("Título de la red", max_length=100, default="Red Llave Extra")
    network_layout = models.CharField("Distribución", max_length=8, choices=NetworkLayout.choices, default=NetworkLayout.RADIAL)
    network_theme = models.CharField("Tema", max_length=5, choices=NetworkTheme.choices, default=NetworkTheme.SAND)
    network_background = models.CharField("Fondo", max_length=6, choices=NetworkBackground.choices, default=NetworkBackground.HARBOR)
    network_page_size = models.PositiveSmallIntegerField("Prestadores por página", default=12)
    network_interval_seconds = models.PositiveSmallIntegerField("Intervalo en segundos", default=10)

    class Meta:
        verbose_name = "Configuración del catálogo público"
        verbose_name_plural = "Configuración del catálogo público"
        constraints = [
            models.CheckConstraint(condition=Q(singleton=1), name="catalog_config_singleton"),
            models.CheckConstraint(condition=Q(network_page_size__gte=10, network_page_size__lte=15), name="catalog_network_page_size_range"),
            models.CheckConstraint(condition=Q(network_interval_seconds__gte=8, network_interval_seconds__lte=60), name="catalog_network_interval_range"),
            models.CheckConstraint(condition=Q(network_layout__in=("RADIAL", "ORBIT")), name="catalog_network_layout_choice"),
            models.CheckConstraint(condition=Q(network_theme__in=("SAND", "OCEAN")), name="catalog_network_theme_choice"),
            models.CheckConstraint(condition=Q(network_background__in=("HARBOR", "BEAGLE")), name="catalog_network_background_choice"),
        ]

    def delete(self, *args, **kwargs):
        raise ValidationError("No se puede eliminar la configuración del catálogo")
