import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class CommissionState(models.TextChoices):
    AWAITING_PROVIDER = "AWAITING_PROVIDER", "Falta verificación del Prestador"
    TO_PAY = "TO_PAY", "A pagar comisión"
    COMPLETED = "COMPLETED", "Completado"
    NO_COMMISSION = "NO_COMMISSION", "Sin comisión"
    ANNULLED = "ANNULLED", "Anulado"
    HISTORICAL = "HISTORICAL", "Histórico"
    DEMO = "DEMO", "Demostración"


class CommissionRule(models.Model):
    provider = models.OneToOneField(
        "providers.Provider", verbose_name="Prestador", null=True, blank=True, on_delete=models.CASCADE,
    )
    rate = models.DecimalField("Porcentaje", max_digits=5, decimal_places=2)
    version = models.UUIDField("Versión", default=uuid.uuid4, editable=False)

    class Meta:
        verbose_name = "Regla de comisión"
        verbose_name_plural = "Reglas de comisión"
        constraints = [
            models.UniqueConstraint(
                fields=["provider"], nulls_distinct=False, name="commission_rule_unique_scope",
            ),
            models.CheckConstraint(
                condition=Q(rate__gte=0, rate__lte=100), name="commission_rule_rate_range",
            ),
        ]


class Commission(models.Model):
    consumption = models.OneToOneField(
        "credits.Consumption", verbose_name="Consumo", on_delete=models.PROTECT,
        primary_key=True, related_name="commission",
    )
    state = models.CharField(
        "Estado", max_length=24, choices=CommissionState.choices, default=CommissionState.AWAITING_PROVIDER,
    )
    incident = models.BooleanField("Incidencia abierta", default=False)
    declaration = models.ForeignKey(
        "CommissionEvent", verbose_name="Declaración vigente", null=True, on_delete=models.PROTECT, related_name="+",
    )
    approval = models.ForeignKey(
        "CommissionEvent", verbose_name="Aprobación vigente", null=True, on_delete=models.PROTECT, related_name="+",
    )
    payment = models.ForeignKey(
        "CommissionEvent", verbose_name="Informe vigente", null=True, on_delete=models.PROTECT, related_name="+",
    )
    last_event = models.ForeignKey(
        "CommissionEvent", verbose_name="Último evento", null=True, on_delete=models.PROTECT, related_name="+",
    )

    class Meta:
        verbose_name = "Comisión"
        verbose_name_plural = "Comisiones"
        indexes = [models.Index(fields=["state"], name="commission_state_idx")]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(state="AWAITING_PROVIDER", declaration__isnull=True, approval__isnull=True, payment__isnull=True)
                    | Q(state="NO_COMMISSION", declaration__isnull=False, payment__isnull=True)
                    | Q(state="TO_PAY", declaration__isnull=False)
                    | Q(state="COMPLETED", declaration__isnull=False)
                    | Q(state="ANNULLED")
                ),
                name="commission_state_consistent",
            ),
            models.CheckConstraint(
                condition=Q(payment__isnull=True) | Q(approval__isnull=False) | Q(state="ANNULLED"),
                name="commission_payment_requires_approval",
            ),
        ]


class EventKind(models.TextChoices):
    VERIFIED = "VERIFIED", "Consumo verificado"
    DECLARED = "DECLARED", "Declaración del Prestador"
    CORRECTION_REQUESTED = "CORRECTION_REQUESTED", "Corrección solicitada"
    APPROVED = "APPROVED", "Comisión aprobada"
    CLOSED_NO_COMMISSION = "CLOSED_NO_COMMISSION", "Cerrado sin comisión"
    PAYMENT_REPORTED = "PAYMENT_REPORTED", "Pago informado"
    LATE_PAYMENT_REPORTED = "LATE_PAYMENT_REPORTED", "Pago tardío informado"
    PAYMENT_RECONCILED = "PAYMENT_RECONCILED", "Pago verificado"
    REOPENED = "REOPENED", "Devuelto a revisión"
    REPORT_REJECTED = "REPORT_REJECTED", "Informe rechazado"
    INCIDENT_OPENED = "INCIDENT_OPENED", "Incidencia abierta"
    INCIDENT_CLOSED = "INCIDENT_CLOSED", "Incidencia cerrada"
    ANNULLED = "ANNULLED", "Consumo anulado"
    BANK_REVEALED = "BANK_REVEALED", "Datos bancarios consultados"


class Outcome(models.TextChoices):
    CONSUMED = "CONSUMED", "Se concretó"
    NOT_CONSUMED = "NOT_CONSUMED", "No consumió"


class RuleSource(models.TextChoices):
    GLOBAL = "GLOBAL", "Regla global"
    PROVIDER = "PROVIDER", "Excepción del Prestador"


class CommissionEvent(models.Model):
    commission = models.ForeignKey(
        Commission, verbose_name="Comisión", on_delete=models.PROTECT, related_name="events",
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Autor", on_delete=models.PROTECT)
    actor_name = models.CharField("Nombre registrado del autor", max_length=301)
    kind = models.CharField("Tipo", max_length=32, choices=EventKind.choices)
    created_at = models.DateTimeField("Fecha")
    reason = models.TextField("Motivo", blank=True)
    basis = models.ForeignKey(
        "self", verbose_name="Evento de origen", null=True, on_delete=models.PROTECT, related_name="+",
    )
    outcome = models.CharField("Resultado declarado", max_length=16, choices=Outcome.choices, blank=True)
    currency = models.CharField("Moneda", max_length=3, default="ARS")
    amount = models.DecimalField("Importe en ARS", max_digits=14, decimal_places=2, null=True)
    base_amount = models.DecimalField("Base aprobada en ARS", max_digits=14, decimal_places=2, null=True)
    rate = models.DecimalField("Porcentaje aplicado", max_digits=5, decimal_places=2, null=True)
    rule_source = models.CharField("Origen de la regla", max_length=8, choices=RuleSource.choices, blank=True)
    bank_version = models.UUIDField("Versión del dato bancario", null=True)
    date = models.DateField("Fecha informada del pago", null=True)
    reference = models.CharField("Referencia de la operación", max_length=120, blank=True)
    receipt_checked = models.BooleanField("Comprobante cotejado", default=False)
    receipt_confirmed = models.BooleanField("Recepción confirmada", default=False)

    class Meta:
        verbose_name = "Evento de comisión"
        verbose_name_plural = "Eventos de comisión"
        indexes = [models.Index(fields=["commission", "id"], name="commission_event_order_idx")]
        constraints = [
            models.CheckConstraint(condition=Q(kind__in=EventKind.values), name="commission_event_kind_valid"),
            models.CheckConstraint(condition=Q(currency="ARS"), name="commission_event_uses_ars"),
            models.CheckConstraint(
                condition=Q(amount__isnull=True) | Q(amount__gte=0),
                name="commission_event_amount_nonnegative",
            ),
            models.CheckConstraint(
                condition=~Q(kind="DECLARED")
                | Q(outcome="CONSUMED", amount__isnull=False)
                | Q(outcome="NOT_CONSUMED", amount__isnull=True),
                name="commission_declaration_complete",
            ),
            models.CheckConstraint(
                condition=~Q(kind="APPROVED") | (
                    Q(basis__isnull=False, amount__isnull=False, base_amount__gte=0, base_amount__isnull=False,
                      rate__gte=0, rate__lte=100, rate__isnull=False, rule_source__in=RuleSource.values)
                    & (Q(amount=0) | Q(bank_version__isnull=False))
                ),
                name="commission_approval_complete",
            ),
            models.CheckConstraint(
                condition=~Q(kind__in=["PAYMENT_REPORTED", "LATE_PAYMENT_REPORTED"]) | (
                    Q(basis__isnull=False, date__isnull=False, amount__gt=0, amount__isnull=False) & ~Q(reference="")
                ),
                name="commission_payment_report_complete",
            ),
            models.CheckConstraint(
                condition=~Q(kind="PAYMENT_RECONCILED")
                | Q(basis__isnull=False, receipt_checked=True, receipt_confirmed=True),
                name="commission_reconciliation_complete",
            ),
        ]


class PaymentReference(models.Model):
    provider = models.ForeignKey("providers.Provider", verbose_name="Prestador", on_delete=models.PROTECT)
    commission = models.ForeignKey(Commission, verbose_name="Comisión", on_delete=models.PROTECT)
    reference = models.CharField("Referencia de la operación", max_length=120)

    class Meta:
        verbose_name = "Referencia de pago de comisión"
        verbose_name_plural = "Referencias de pago de comisión"
        constraints = [
            models.UniqueConstraint(fields=["provider", "reference"], name="commission_reference_unique_provider"),
        ]


class CommissionCommand(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Usuario", on_delete=models.PROTECT)
    key = models.CharField("Clave idempotente", max_length=128)
    fingerprint = models.CharField("Huella de solicitud", max_length=64)
    response = models.JSONField("Resultado")

    class Meta:
        verbose_name = "Comando de comisiones"
        verbose_name_plural = "Comandos de comisiones"
        constraints = [models.UniqueConstraint(fields=["actor", "key"], name="commission_command_unique_actor_key")]
