import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q


class CollaboratorProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="collaborator_profile")
    enabled = models.BooleanField(default=False)
    qr_version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(qr_version__gte=1), name="qr_version_positive")]

    def clean(self):
        if self.user.role != self.user.Role.COLLABORATOR:
            raise ValidationError("El perfil requiere un colaborador")

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
