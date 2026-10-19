import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q


class CollaboratorProfile(models.Model):
    class NetworkLayout(models.TextChoices):
        RADIAL = "RADIAL", "Radial"
        ORBIT = "ORBIT", "Órbita"

    class NetworkTheme(models.TextChoices):
        SAND = "SAND", "Arena"
        OCEAN = "OCEAN", "Océano"

    class NetworkBackground(models.TextChoices):
        HARBOR = "HARBOR", "Puerto"
        BEAGLE = "BEAGLE", "Canal Beagle"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="collaborator_profile")
    enabled = models.BooleanField(default=False)
    qr_version = models.PositiveIntegerField(default=1)
    network_title = models.CharField(max_length=100, default="Recomendaciones")
    network_layout = models.CharField(max_length=8, choices=NetworkLayout.choices, default=NetworkLayout.RADIAL)
    network_theme = models.CharField(max_length=5, choices=NetworkTheme.choices, default=NetworkTheme.SAND)
    network_background = models.CharField(max_length=6, choices=NetworkBackground.choices, default=NetworkBackground.HARBOR)
    network_page_size = models.PositiveSmallIntegerField(default=12)
    network_interval_seconds = models.PositiveSmallIntegerField(default=10)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(qr_version__gte=1), name="qr_version_positive"),
            models.CheckConstraint(condition=Q(network_page_size__gte=10, network_page_size__lte=15), name="profile_network_page_size_range"),
            models.CheckConstraint(condition=Q(network_interval_seconds__gte=8, network_interval_seconds__lte=60), name="profile_network_interval_range"),
            models.CheckConstraint(condition=Q(network_layout__in=("RADIAL", "ORBIT")), name="profile_network_layout_choice"),
            models.CheckConstraint(condition=Q(network_theme__in=("SAND", "OCEAN")), name="profile_network_theme_choice"),
            models.CheckConstraint(condition=Q(network_background__in=("HARBOR", "BEAGLE")), name="profile_network_background_choice"),
        ]

    def clean(self):
        if self.pk and not self._state.adding:
            original_user_id = type(self).objects.filter(pk=self.pk).values_list("user_id", flat=True).first()
            if original_user_id is not None and original_user_id != self.user_id:
                raise ValidationError({"user": "No se puede cambiar el titular de un perfil existente"})
        if self.user.role != self.user.Role.COLLABORATOR:
            raise ValidationError("El perfil requiere un colaborador")

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.pk:
                original_user_id = (type(self).objects.select_for_update()
                                    .filter(pk=self.pk).values_list("user_id", flat=True).first())
                if original_user_id is not None and original_user_id != self.user_id:
                    raise ValidationError({"user": "No se puede cambiar el titular de un perfil existente"})
            return super().save(*args, **kwargs)

    @classmethod
    def set_enabled(cls, pk, enabled: bool):
        with transaction.atomic():
            profile = cls.objects.select_for_update().get(pk=pk)
            profile.enabled = enabled
            profile.save(update_fields=["enabled"])

    @classmethod
    def rotate(cls, pk):
        with transaction.atomic():
            cls.objects.select_for_update().get(pk=pk)
            cls.objects.filter(pk=pk).update(qr_version=F("qr_version") + 1)


class FolderAccess(models.Model):
    tourist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="folder_accesses")
    collaborator = models.ForeignKey(CollaboratorProfile, on_delete=models.PROTECT, related_name="grants")
    qr_version = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tourist", "collaborator", "qr_version"], name="unique_folder_access_version")]
