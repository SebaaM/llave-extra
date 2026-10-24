from django.conf import settings
from django.db import models
from django.db.models import Q

from .validators import validate_instagram, validate_plain_text, validate_whatsapp


class SiteSettings(models.Model):
    singleton = models.PositiveSmallIntegerField("Identificador", primary_key=True, default=1, editable=False)
    site_name = models.CharField("Nombre del sitio", max_length=160, default="Llave Extra", validators=[validate_plain_text])
    home_title = models.CharField("Título de portada", max_length=200, default="Beneficios para descubrir más de Ushuaia.", validators=[validate_plain_text])
    home_description = models.CharField("Descripción de portada", max_length=1000, default="Conocé propuestas de prestadores locales, revisá sus condiciones y sumá visitas verificadas a tu pasaporte de viaje.", validators=[validate_plain_text])
    footer_text = models.CharField("Texto del pie", max_length=500, default="Llave Extra conecta tu viaje con beneficios locales en Ushuaia.", validators=[validate_plain_text])
    contact_email = models.EmailField("Email de contacto", blank=True)
    whatsapp_url = models.URLField("WhatsApp", max_length=500, blank=True, validators=[validate_whatsapp])
    instagram_url = models.URLField("Instagram", max_length=500, blank=True, validators=[validate_instagram])

    class Meta:
        verbose_name = "Configuración del sitio"
        verbose_name_plural = "Configuración del sitio"
        constraints = [models.CheckConstraint(condition=Q(singleton=1), name="site_settings_singleton")]


class AdminAudit(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Administrador", on_delete=models.PROTECT)
    action = models.CharField("Acción", max_length=100, db_index=True)
    resource = models.CharField("Recurso", max_length=100, db_index=True)
    object_id = models.CharField("Identificador del recurso", max_length=100)
    changed_fields = models.JSONField("Campos modificados", default=list, blank=True)
    reason = models.CharField("Motivo", max_length=500, blank=True)
    created_at = models.DateTimeField("Fecha", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Actividad administrativa"
        verbose_name_plural = "Actividades administrativas"


class AdminCommand(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Administrador", on_delete=models.PROTECT)
    action = models.CharField("Acción", max_length=100)
    key = models.CharField("Clave idempotente", max_length=128)
    fingerprint = models.CharField("Huella HMAC", max_length=64)
    response = models.JSONField("Resultado saneado", default=dict)
    status_code = models.PositiveSmallIntegerField("Código HTTP", default=200)
    completed = models.BooleanField("Completado", default=False)
    created_at = models.DateTimeField("Fecha", auto_now_add=True)

    class Meta:
        verbose_name = "Comando administrativo"
        verbose_name_plural = "Comandos administrativos"
        constraints = [models.UniqueConstraint(fields=["actor", "action", "key"], name="admin_command_actor_action_key")]
