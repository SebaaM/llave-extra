from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


class AdminRoleOnlyMixin:
    def _is_program_admin(self, request):
        return request.user.is_active and request.user.is_superuser and request.user.role == User.Role.ADMIN

    def has_module_permission(self, request):
        return self._is_program_admin(request) and super().has_module_permission(request)

    def has_view_permission(self, request, obj=None):
        return self._is_program_admin(request) and super().has_view_permission(request, obj)

    def has_add_permission(self, request):
        return self._is_program_admin(request) and super().has_add_permission(request)

    def has_change_permission(self, request, obj=None):
        return self._is_program_admin(request) and super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return self._is_program_admin(request) and super().has_delete_permission(request, obj)


@admin.register(User)
class LlaveUserAdmin(AdminRoleOnlyMixin, UserAdmin):
    ordering = ("email",)
    list_display = ("email", "role", "is_staff", "is_active", "email_verified")
    search_fields = ("email",)
    fieldsets = ((None, {"fields": ("email", "password")}),
                 ("Perfil", {"fields": ("first_name", "last_name", "role", "email_verified")}),
                 ("Permisos", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}))
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role")}),)

    def has_delete_permission(self, request, obj=None):
        return False
