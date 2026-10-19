from django.contrib import admin, messages

from accounts.admin import AdminRoleOnlyMixin

from .models import CollaboratorProfile, FolderAccess


@admin.register(CollaboratorProfile)
class CollaboratorProfileAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("user", "enabled", "qr_version", "network_title", "network_layout", "network_theme")
    search_fields = ("user__email",)
    readonly_fields = ("id", "enabled", "qr_version")
    actions = ("enable", "disable", "rotate")

    def get_readonly_fields(self, request, obj=None):
        fields = super().get_readonly_fields(request, obj)
        return (*fields, "user") if obj is not None else fields

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)

    @admin.action(description="Habilitar colaboradores seleccionados")
    def enable(self, request, queryset):
        for pk in queryset.values_list("pk", flat=True):
            CollaboratorProfile.set_enabled(pk, True)
        self.message_user(request, "Colaboradores habilitados", messages.SUCCESS)

    @admin.action(description="Deshabilitar colaboradores seleccionados")
    def disable(self, request, queryset):
        for pk in queryset.values_list("pk", flat=True):
            CollaboratorProfile.set_enabled(pk, False)
        self.message_user(request, "Colaboradores deshabilitados", messages.SUCCESS)

    @admin.action(description="Rotar QR de colaboradores seleccionados")
    def rotate(self, request, queryset):
        for pk in queryset.values_list("pk", flat=True):
            CollaboratorProfile.rotate(pk)
        self.message_user(request, "QR rotados", messages.SUCCESS)


@admin.register(FolderAccess)
class FolderAccessAdmin(AdminRoleOnlyMixin, admin.ModelAdmin):
    list_display = ("tourist", "collaborator", "qr_version", "created_at")
    readonly_fields = ("tourist", "collaborator", "qr_version", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
