from django.contrib import admin

from accounts.admin import AdminRoleOnlyMixin

from .models import Benefit, CatalogConfig, FolderProvider, Provider, ProviderMembership


@admin.register(CatalogConfig)
class CatalogConfigAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("singleton", "enabled")
    fields = ("enabled",)

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

    def get_readonly_fields(self, request, obj=None):
        return ("collaborator", "provider") if obj else ()

    def delete_model(self, request, obj):
        FolderProvider.remove(obj.collaborator_id, obj.provider_id)

    def delete_queryset(self, request, queryset):
        for profile_id, provider_id in queryset.values_list("collaborator_id", "provider_id"):
            FolderProvider.remove(profile_id, provider_id)


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
