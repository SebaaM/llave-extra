from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ActionForm

from accounts.admin import AdminRoleOnlyMixin

from .models import (
    AdjustmentCase,
    Consumption,
    ConsumptionIdempotency,
    CreditPolicy,
    ProviderConsumptionCredential,
    ProviderCreditRule,
    Wallet,
    WalletEntry,
)
from .services import (
    annul_consumption,
    resolve_adjustment,
    rotate_provider_qr,
    set_provider_pin,
    sign_provider_qr,
)


class ImmutableAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CreditPolicy)
class CreditPolicyAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("base_reward", "target_visits")
    fields = ("base_reward", "target_visits")

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not CreditPolicy.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)


@admin.register(ProviderCreditRule)
class ProviderCreditRuleAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("provider", "reward")
    fields = ("provider", "reward")

    def get_readonly_fields(self, request, obj=None):
        return ("provider",) if obj else ()

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(request, obj)

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        obj.delete()

    def delete_queryset(self, request, queryset):
        for rule in queryset:
            rule.delete()


class CredentialForm(forms.ModelForm):
    pin = forms.RegexField(r"^[0-9]{6,12}$", required=False,
                           widget=forms.PasswordInput(render_value=False),
                           help_text="6 a 12 dígitos; nunca se muestra")

    class Meta:
        model = ProviderConsumptionCredential
        fields = ("provider",)

    def clean_pin(self):
        pin = self.cleaned_data.get("pin", "")
        if self.instance._state.adding and not pin:
            raise forms.ValidationError("El PIN es obligatorio")
        return pin


@admin.register(ProviderConsumptionCredential)
class CredentialAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    form = CredentialForm
    list_display = ("provider", "qr_version", "configured")
    fields = ("provider", "qr_version", "pin", "qr_url")
    readonly_fields = ("qr_version", "qr_url")
    actions = ("rotate_qr",)

    def get_readonly_fields(self, request, obj=None):
        return (*self.readonly_fields, "provider") if obj else self.readonly_fields

    def has_delete_permission(self, request, obj=None):
        return False

    def configured(self, obj):
        return bool(obj.pin_hash)
    configured.boolean = True

    def qr_url(self, obj):
        if not obj or not obj.pk or not obj.pin_hash:
            return "Configurá un PIN primero"
        from django.conf import settings
        return f"{settings.PUBLIC_APP_URL}/consumo#token={sign_provider_qr(obj)}"

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if form.cleaned_data.get("pin"):
            set_provider_pin(obj.provider_id, form.cleaned_data["pin"])

    @admin.action(description="Rotar QR de prestadores seleccionados")
    def rotate_qr(self, request, queryset):
        for provider_id in queryset.values_list("provider_id", flat=True):
            rotate_provider_qr(provider_id)
        self.message_user(request, "QR rotados", messages.SUCCESS)


class ReasonActionForm(ActionForm):
    reason = forms.CharField(required=False, max_length=500, label="Motivo obligatorio para acción financiera")
    resolution = forms.ChoiceField(required=False, choices=[("", "--"), *AdjustmentCase.Resolution.choices])


@admin.register(Consumption)
class ConsumptionAdmin(ImmutableAdmin):
    list_display = ("tourist", "provider", "collaborator", "award", "state", "created_at")
    readonly_fields = ("tourist", "provider", "collaborator", "award", "rule_snapshot", "state", "created_at", "annulled_at", "annulled_by", "annul_reason")
    action_form = ReasonActionForm
    actions = ("annul_selected",)

    @admin.action(description="Anular consumos seleccionados con motivo")
    def annul_selected(self, request, queryset):
        reason = request.POST.get("reason", "").strip()
        if not reason:
            self.message_user(request, "Indicá un motivo", messages.ERROR)
            return
        successes = 0
        for pk in queryset.values_list("pk", flat=True):
            try:
                annul_consumption(pk, request.user, reason)
                successes += 1
            except Exception as exc:
                self.message_user(request, f"{pk}: {exc}", messages.ERROR)
        self.message_user(request, f"{successes} consumos anulados", messages.SUCCESS)


@admin.register(AdjustmentCase)
class AdjustmentAdmin(ImmutableAdmin):
    list_display = ("consumption", "shortfall", "funded_amount", "forgiven_amount", "created_at", "resolved_at", "resolution")
    readonly_fields = ("consumption", "shortfall", "funded_amount", "forgiven_amount", "created_at", "resolved_at", "resolved_by", "resolution", "resolution_reason")
    action_form = ReasonActionForm
    actions = ("resolve_selected",)

    @admin.action(description="Resolver ajustes seleccionados con motivo y resolución")
    def resolve_selected(self, request, queryset):
        reason = request.POST.get("reason", "").strip()
        resolution = request.POST.get("resolution", "")
        if not reason or resolution not in AdjustmentCase.Resolution.values:
            self.message_user(request, "Indicá motivo y resolución", messages.ERROR)
            return
        successes = 0
        for pk in queryset.values_list("pk", flat=True):
            try:
                resolve_adjustment(pk, request.user, resolution, reason)
                successes += 1
            except Exception as exc:
                self.message_user(request, f"{pk}: {exc}", messages.ERROR)
        self.message_user(request, f"{successes} ajustes resueltos", messages.SUCCESS)


@admin.register(Wallet)
class WalletAdmin(ImmutableAdmin):
    list_display = ("tourist", "balance", "redemptions_frozen")
    readonly_fields = ("tourist", "balance", "redemptions_frozen")


@admin.register(WalletEntry)
class WalletEntryAdmin(ImmutableAdmin):
    list_display = ("wallet", "kind", "delta", "reference", "created_at")
    readonly_fields = ("id", "wallet", "kind", "delta", "reference", "created_at")


@admin.register(ConsumptionIdempotency)
class IdempotencyAdmin(ImmutableAdmin):
    list_display = ("actor", "operation", "created_at")
    readonly_fields = ("actor", "operation", "key", "fingerprint", "status_code", "created_at")
