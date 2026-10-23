from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ActionForm
from django.db import transaction
from rest_framework.exceptions import APIException

from accounts.admin import AdminRoleOnlyMixin
from credits.admin import ImmutableAdmin

from .models import (
    CancellationRequest,
    CheckoutKey,
    Order,
    OrderAudit,
    OrderLine,
    PaymentOperation,
    Product,
    ShopSettings,
    StockAdjustment,
)
from .services import adjust_stock, advance_order, resolve_cancellation


class ShopActionForm(ActionForm):
    reason = forms.CharField(label="Motivo obligatorio", max_length=500, required=False)
    delta = forms.IntegerField(label="Variación de stock", required=False, min_value=-1_000_000, max_value=1_000_000)


class ActionMixin:
    action_form = ShopActionForm

    def run_action(self, request, queryset, callback):
        reason = request.POST.get("reason", "")
        for obj in queryset.order_by("pk"):
            try:
                callback(obj, reason)
            except (APIException, ValueError) as exc:
                self.message_user(request, str(exc), messages.ERROR)
            else:
                self.message_user(request, "Operación registrada", messages.SUCCESS)


@admin.register(Product)
class ProductAdmin(ActionMixin, AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("name", "active", "stock", "price_money", "price_credits")
    readonly_fields = ("stock",)
    actions = ("adjust_selected",)

    def has_delete_permission(self, request, obj=None):
        return False

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        if change:
            # Never persist stale stock from a form opened before a checkout/delta.
            Product.objects.select_for_update().get(pk=obj.pk)
            obj.save(update_fields=["name", "description", "image", "active", "price_money", "price_credits"])
        else:
            obj.stock = 0
            obj.save()

    @admin.action(description="Aplicar variación de stock con motivo")
    def adjust_selected(self, request, queryset):
        self.run_action(request, queryset, lambda obj, reason: adjust_stock(
            request.user, obj.pk, delta=int(request.POST.get("delta", "")), reason=reason))


@admin.register(ShopSettings)
class ShopSettingsAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("pickup_name", "pickup_enabled", "pickup_address", "pickup_hours")

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not ShopSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(ActionMixin, ImmutableAdmin):
    list_display = ("id", "customer", "mode", "state", "total_money", "total_credits", "created_at")
    actions = ("prepare_selected", "deliver_selected")

    @admin.action(description="Marcar pedidos pagados como preparados")
    def prepare_selected(self, request, queryset):
        self.run_action(request, queryset, lambda obj, reason: advance_order(
            request.user, obj.pk, target=Order.State.READY, reason=reason))

    @admin.action(description="Registrar entrega de pedidos preparados")
    def deliver_selected(self, request, queryset):
        self.run_action(request, queryset, lambda obj, reason: advance_order(
            request.user, obj.pk, target=Order.State.PICKED_UP, reason=reason))


@admin.register(CancellationRequest)
class CancellationAdmin(ActionMixin, ImmutableAdmin):
    list_display = ("order", "reason", "state", "created_at", "resolved_at")
    actions = ("approve_selected", "reject_selected")

    @admin.action(description="Aprobar cancelaciones de canjes con motivo")
    def approve_selected(self, request, queryset):
        self.run_action(request, queryset, lambda obj, reason: resolve_cancellation(
            request.user, obj.pk, approve=True, reason=reason))

    @admin.action(description="Rechazar solicitudes de cancelación con motivo")
    def reject_selected(self, request, queryset):
        self.run_action(request, queryset, lambda obj, reason: resolve_cancellation(
            request.user, obj.pk, approve=False, reason=reason))


for model in (OrderLine, CheckoutKey, StockAdjustment, OrderAudit, PaymentOperation):
    admin.site.register(model, ImmutableAdmin)
