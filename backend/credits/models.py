import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q

MAX_CREDITS = 1_000_000


class CreditPolicy(models.Model):
    singleton = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    base_reward = models.PositiveIntegerField(default=1000)
    target_visits = models.PositiveIntegerField(default=5)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(singleton=1), name="credit_policy_singleton"),
            models.CheckConstraint(condition=Q(base_reward__lte=MAX_CREDITS), name="credit_base_bound"),
            models.CheckConstraint(condition=Q(target_visits__gte=1) & Q(target_visits__lte=1000), name="credit_target_bound"),
        ]

    def clean(self):
        if self.base_reward > MAX_CREDITS or not 1 <= self.target_visits <= 1000:
            raise ValidationError("Regla de créditos fuera de rango")

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if type(self).objects.filter(pk=1).exists():
                type(self).objects.select_for_update().get(pk=1)
            return super().save(*args, **kwargs)


class ProviderCreditRule(models.Model):
    provider = models.OneToOneField("providers.Provider", on_delete=models.PROTECT, related_name="credit_rule")
    reward = models.PositiveIntegerField()

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(reward__lte=MAX_CREDITS), name="provider_reward_bound")]

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
    provider = models.OneToOneField("providers.Provider", on_delete=models.PROTECT, related_name="consumption_credential")
    qr_version = models.PositiveIntegerField(default=1)
    pin_hash = models.CharField(max_length=128, blank=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(qr_version__gte=1), name="provider_qr_version_positive")]


class Wallet(models.Model):
    tourist = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="wallet")
    balance = models.PositiveBigIntegerField(default=0)
    redemptions_frozen = models.BooleanField(default=False)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(balance__gte=0), name="wallet_balance_nonnegative")]


class WalletEntry(models.Model):
    class Kind(models.TextChoices):
        EARN = "EARN", "Acreditación"
        REDEEM = "REDEEM", "Canje"
        REFUND = "REFUND", "Reintegro"
        REVERSAL = "REVERSAL", "Anulación"
        ADJUSTMENT = "ADJUSTMENT", "Ajuste"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(Wallet, on_delete=models.PROTECT, related_name="entries")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    delta = models.BigIntegerField()
    reference = models.CharField(max_length=120, unique=True)
    source_entry = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT,
                                     related_name="refunds")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
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
    tourist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="consumptions")
    provider = models.ForeignKey("providers.Provider", on_delete=models.PROTECT)
    collaborator = models.ForeignKey("referrals.CollaboratorProfile", on_delete=models.PROTECT,
                                     null=True, blank=True)
    award = models.PositiveIntegerField()
    rule_snapshot = models.JSONField()
    state = models.CharField(max_length=10, choices=State.choices, default=State.VALID)
    created_at = models.DateTimeField(auto_now_add=True)
    annulled_at = models.DateTimeField(null=True, blank=True)
    annulled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="annulled_consumptions")
    annul_reason = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tourist", "provider"], name="one_consumption_per_tourist_provider_lifetime"),
            models.CheckConstraint(condition=Q(award__lte=MAX_CREDITS), name="consumption_award_bound"),
            models.CheckConstraint(
                condition=(Q(state="VALID", annulled_at__isnull=True, annulled_by__isnull=True, annul_reason="") |
                           (Q(state="ANNULLED", annulled_at__isnull=False, annulled_by__isnull=False) & ~Q(annul_reason=""))),
                name="consumption_annul_audit_complete",
            ),
        ]


class ConsumptionIdempotency(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    operation = models.CharField(max_length=32, default="consume")
    key = models.CharField(max_length=128)
    fingerprint = models.CharField(max_length=64)
    response = models.JSONField()
    status_code = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["actor", "operation", "key"], name="unique_consumption_idempotency")]


class AdjustmentCase(models.Model):
    class Resolution(models.TextChoices):
        REVERSAL = "REVERSAL", "Saldo recuperado"
        FUNDED = "FUNDED", "Aporte auditado"
        FORGIVEN = "FORGIVEN", "Condonación auditada"

    consumption = models.OneToOneField(Consumption, on_delete=models.PROTECT, related_name="adjustment")
    shortfall = models.PositiveIntegerField()
    funded_amount = models.PositiveIntegerField(default=0)
    forgiven_amount = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    resolution = models.CharField(max_length=12, choices=Resolution.choices, blank=True)
    resolution_reason = models.TextField(blank=True)

    class Meta:
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
