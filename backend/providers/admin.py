from django import forms
from django.contrib import admin
from django.db import transaction

from accounts.admin import AdminRoleOnlyMixin
from referrals.models import CollaboratorProfile

from .models import (
    Benefit,
    CatalogConfig,
    FolderBenefit,
    FolderProvider,
    Provider,
    ProviderMembership,
)

NETWORK_LABELS = {
    "network_title": "Título de la red",
    "network_layout": "Distribución",
    "network_theme": "Tema",
    "network_background": "Fondo",
    "network_page_size": "Prestadores por página",
    "network_interval_seconds": "Intervalo en segundos",
}


class CatalogConfigForm(forms.ModelForm):
    class Meta:
        model = CatalogConfig
        fields = "__all__"
        labels = {"enabled": "Catálogo público habilitado", **NETWORK_LABELS}


@admin.register(CatalogConfig)
class CatalogConfigAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    form = CatalogConfigForm
    list_display = ("singleton", "enabled", "network_title", "network_layout", "network_theme", "network_background")
    fields = ("enabled", "network_title", "network_layout", "network_theme", "network_background", "network_page_size", "network_interval_seconds")

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not CatalogConfig.objects.filter(singleton=1).exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Provider)
class ProviderAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("name", "legacy_public_id", "status", "demo")
    search_fields = ("name", "legacy_public_id")
    list_filter = ("status", "demo")
    readonly_fields = ("id", "legacy_public_id", "demo", "provenance")

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)


@admin.register(ProviderMembership)
class ProviderMembershipAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("user", "provider")

    def get_readonly_fields(self, request, obj=None):
        return ("user", "provider") if obj else ()

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)


@admin.register(FolderProvider)
class FolderProviderAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("collaborator", "provider")
    readonly_fields = ("collaborator", "provider")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FolderBenefit)
class FolderBenefitAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("collaborator", "benefit", "created_at")
    readonly_fields = ("created_at",)

    def get_readonly_fields(self, request, obj=None):
        return (*self.readonly_fields, "collaborator", "benefit") if obj else self.readonly_fields

    def delete_model(self, request, obj):
        FolderBenefit.remove(obj.collaborator_id, obj.benefit_id)

    def delete_queryset(self, request, queryset):
        # A bulk admin action must take *all* profile locks before any provider:
        # interleaving profile/provider pairs could deadlock with a single PUT.
        with transaction.atomic():
            profile_ids = list(queryset.values_list("collaborator_id", flat=True))
            list(CollaboratorProfile.objects.select_for_update(of=("self",)).filter(pk__in=profile_ids).order_by("pk"))
            selections = list(queryset.values_list("collaborator_id", "benefit_id", "benefit__provider_id"))
            list(Provider.objects.select_for_update().filter(pk__in=[row[2] for row in selections]).order_by("pk"))
            list(Benefit.objects.select_for_update().filter(pk__in=[row[1] for row in selections]).order_by("pk"))
            for profile_id, benefit_id, _ in selections:
                FolderBenefit.remove(profile_id, benefit_id)


@admin.register(Benefit)
class BenefitAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("title", "provider", "status", "valid_from", "valid_until", "demo")
    list_filter = ("status", "demo")
    readonly_fields = ("id", "demo", "provenance")

    def get_readonly_fields(self, request, obj=None):
        fields = super().get_readonly_fields(request, obj)
        return (*fields, "provider") if obj else fields

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)
