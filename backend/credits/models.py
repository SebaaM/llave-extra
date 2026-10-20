import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q

MAX_CREDITS = 1_000_000


class CreditPolicy(models.Model):
    singleton = models.PositiveSmallIntegerField("Identificador de regla", primary_key=True, default=1, editable=False)
    base_reward = models.PositiveIntegerField("Créditos por consumo", default=1000)
    target_visits = models.PositiveIntegerField("Consumos para completar la meta", default=5)

    class Meta:
        verbose_name = "Regla global de créditos"
        verbose_name_plural = "Regla global de créditos"
        constraints = [
            models.CheckConstraint(condition=Q(singleton=1), name="credit_policy_singleton"),
            models.CheckConstraint(condition=Q(base_reward__lte=MAX_CREDITS), name="credit_base_bound"),
            models.CheckConstraint(condition=Q(target_visits__gte=1) & Q(target_visits__lte=1000), name="credit_target_bound"),
        ]

    def __str__(self):
        return "Regla global de créditos"

    def clean(self):
        if self.base_reward > MAX_CREDITS or not 1 <= self.target_visits <= 1000:
            raise ValidationError("Regla de créditos fuera de rango")

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if type(self).objects.filter(pk=1).exists():
                type(self).objects.select_for_update().get(pk=1)
            return super().save(*args, **kwargs)


class ProviderCreditRule(models.Model):
    provider = models.OneToOneField("providers.Provider", verbose_name="Prestador", on_delete=models.PROTECT, related_name="credit_rule")
    reward = models.PositiveIntegerField("Créditos por consumo")

    class Meta:
        verbose_name = "Regla de créditos por prestador"
        verbose_name_plural = "Reglas de créditos por prestador"
        constraints = [models.CheckConstraint(condition=Q(reward__lte=MAX_CREDITS), name="provider_reward_bound")]

    def __str__(self):
        return f"Regla de créditos — {self.provider}"

    def clean(self):
        if self.reward > MAX_CREDITS:
            raise ValidationError("Valor de prestador fuera de rango")

    def save(self, *args, **kwargs):
        with transaction.atomic():
            self.provider.__class__.objects.select_for_update().get(pk=self.provider_id)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        with transaction.atomic():
            self.provider.__class__.objects.select_for_update().get(pk=self.provider_id)
            return super().delete(*args, **kwargs)


class ProviderConsumptionCredential(models.Model):
    provider = models.OneToOneField("providers.Provider", verbose_name="Prestador", on_delete=models.PROTECT, related_name="consumption_credential")
    qr_version = models.PositiveIntegerField("Versión del QR", default=1)
    pin_hash = models.CharField("PIN del prestador", max_length=128, blank=True)

    class Meta:
        verbose_name = "Credencial de consumo"
        verbose_name_plural = "Credenciales de consumo"
        constraints = [models.CheckConstraint(condition=Q(qr_version__gte=1), name="provider_qr_version_positive")]

    def __str__(self):
        return f"Credencial — {self.provider}"


class Wallet(models.Model):
    tourist = models.OneToOneField(settings.AUTH_USER_MODEL, verbose_name="Cliente", on_delete=models.PROTECT, related_name="wallet")
    balance = models.PositiveBigIntegerField("Saldo de créditos", default=0)
    redemptions_frozen = models.BooleanField("Canjes bloqueados", default=False)

    class Meta:
        verbose_name = "Billetera"
        verbose_name_plural = "Billeteras"
        constraints = [models.CheckConstraint(condition=Q(balance__gte=0), name="wallet_balance_nonnegative")]

    def __str__(self):
        return f"Billetera de {self.tourist}"


class WalletEntry(models.Model):
    class Kind(models.TextChoices):
        EARN = "EARN", "Acreditación"
        REDEEM = "REDEEM", "Canje"
        REFUND = "REFUND", "Reintegro"
        REVERSAL = "REVERSAL", "Anulación"
        ADJUSTMENT = "ADJUSTMENT", "Ajuste"

    id = models.UUIDField("Identificador", primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(Wallet, verbose_name="Billetera", on_delete=models.PROTECT, related_name="entries")
    kind = models.CharField("Tipo de movimiento", max_length=12, choices=Kind.choices)
    delta = models.BigIntegerField("Variación de créditos")
    reference = models.CharField("Referencia", max_length=120, unique=True)
    source_entry = models.ForeignKey("self", verbose_name="Movimiento de origen", null=True, blank=True, on_delete=models.PROTECT,
                                     related_name="refunds")
    created_at = models.DateTimeField("Fecha del movimiento", auto_now_add=True)

    class Meta:
        verbose_name = "Movimiento de créditos"
        verbose_name_plural = "Movimientos de créditos"
        constraints = [
            models.CheckConstraint(condition=~Q(delta=0), name="wallet_entry_nonzero"),
            models.CheckConstraint(
                condition=(Q(kind="EARN", delta__gt=0, source_entry__isnull=True) |
                           Q(kind="REDEEM", delta__lt=0, source_entry__isnull=True) |
                           Q(kind="REFUND", delta__gt=0, source_entry__isnull=False) |
                           Q(kind="REVERSAL", delta__lt=0, source_entry__isnull=True) |
                           (Q(kind="ADJUSTMENT", source_entry__isnull=True) & ~Q(delta=0))),
                name="wallet_entry_kind_sign_source",
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} — {self.delta:+} créditos"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("El libro de movimientos es inmutable")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("El libro de movimientos es inmutable")


class Consumption(models.Model):
    class State(models.TextChoices):
        VALID = "VALID", "Válido"
        ANNULLED = "ANNULLED", "Anulado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tourist = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Cliente", on_delete=models.PROTECT, related_name="consumptions")
    provider = models.ForeignKey("providers.Provider", verbose_name="Prestador", on_delete=models.PROTECT)
    collaborator = models.ForeignKey("referrals.CollaboratorProfile", verbose_name="Colaborador", on_delete=models.PROTECT,
                                     null=True, blank=True)
    award = models.PositiveIntegerField("Créditos otorgados")
    rule_snapshot = models.JSONField("Instantánea de la regla")
    state = models.CharField("Estado", max_length=10, choices=State.choices, default=State.VALID)
    created_at = models.DateTimeField("Fecha del consumo", auto_now_add=True)
    annulled_at = models.DateTimeField("Fecha de anulación", null=True, blank=True)
    annulled_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Anulado por", null=True, blank=True, on_delete=models.PROTECT, related_name="annulled_consumptions")
    annul_reason = models.TextField("Motivo de anulación", blank=True)

    class Meta:
        verbose_name = "Consumo"
        verbose_name_plural = "Consumos"
        constraints = [
            models.UniqueConstraint(fields=["tourist", "provider"], name="one_consumption_per_tourist_provider_lifetime"),
            models.CheckConstraint(condition=Q(award__lte=MAX_CREDITS), name="consumption_award_bound"),
            models.CheckConstraint(
                condition=(Q(state="VALID", annulled_at__isnull=True, annulled_by__isnull=True, annul_reason="") |
                           (Q(state="ANNULLED", annulled_at__isnull=False, annulled_by__isnull=False) & ~Q(annul_reason=""))),
                name="consumption_annul_audit_complete",
            ),
        ]

    def __str__(self):
        return f"Consumo de {self.tourist} en {self.provider}"


class ConsumptionIdempotency(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Usuario", on_delete=models.PROTECT)
    operation = models.CharField("Operación", max_length=32, default="consume")
    key = models.CharField("Clave idempotente", max_length=128)
    fingerprint = models.CharField("Huella de solicitud", max_length=64)
    response = models.JSONField("Respuesta")
    status_code = models.PositiveSmallIntegerField("Código de respuesta")
    created_at = models.DateTimeField("Fecha de creación", auto_now_add=True)

    class Meta:
        verbose_name = "Solicitud idempotente"
        verbose_name_plural = "Solicitudes idempotentes"
        constraints = [models.UniqueConstraint(fields=["actor", "operation", "key"], name="unique_consumption_idempotency")]

    def __str__(self):
        return f"{self.operation} — {self.actor}"


class AdjustmentCase(models.Model):
    class Resolution(models.TextChoices):
        REVERSAL = "REVERSAL", "Saldo recuperado"
        FUNDED = "FUNDED", "Aporte auditado"
        FORGIVEN = "FORGIVEN", "Condonación auditada"

    consumption = models.OneToOneField(Consumption, verbose_name="Consumo", on_delete=models.PROTECT, related_name="adjustment")
    shortfall = models.PositiveIntegerField("Créditos pendientes de recuperar")
    funded_amount = models.PositiveIntegerField("Créditos aportados", default=0)
    forgiven_amount = models.PositiveIntegerField("Créditos condonados", default=0)
    created_at = models.DateTimeField("Fecha de creación", auto_now_add=True)
    resolved_at = models.DateTimeField("Fecha de resolución", null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Resuelto por", null=True, blank=True, on_delete=models.PROTECT)
    resolution = models.CharField("Resolución", max_length=12, choices=Resolution.choices, blank=True)
    resolution_reason = models.TextField("Motivo de resolución", blank=True)

    class Meta:
        verbose_name = "Ajuste de créditos"
        verbose_name_plural = "Ajustes de créditos"
        constraints = [
            models.CheckConstraint(condition=Q(shortfall__gt=0), name="adjustment_shortfall_positive"),
            models.CheckConstraint(
                condition=(Q(resolved_at__isnull=True, resolved_by__isnull=True,
                             resolution="", resolution_reason="", funded_amount=0, forgiven_amount=0) |
                           (Q(resolved_at__isnull=False, resolved_by__isnull=False) &
                            ~Q(resolution="") & ~Q(resolution_reason=""))),
                name="adjustment_resolution_audit_complete",
            ),
        ]

    def __str__(self):
        return f"Ajuste de {self.consumption}"
