from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.db import transaction
from django.utils import timezone

from .models import AuthSession, OneTimeToken, User

admin.site.site_header = "Administración de Llave Extra"
admin.site.site_title = "Llave Extra · Administración"
admin.site.index_title = "Administración de la red"


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

    def save_model(self, request, obj, form, change):
        if not change:
            return super().save_model(request, obj, form, change)

        with transaction.atomic():
            current = User.objects.select_for_update().only("email", "is_active", "password").get(pk=obj.pk)
            active_changed = current.is_active != obj.is_active
            email_changed = current.email != obj.email.strip().lower()
            # Password changes have a separate view. A profile edit keeps the current hash.
            obj.password = current.password
            if email_changed:
                obj.email_verified = False
            super().save_model(request, obj, form, change)
            now = timezone.now()
            if email_changed:
                OneTimeToken.objects.filter(user_id=obj.pk, used_at__isnull=True).update(used_at=now)
            if active_changed or email_changed:
                AuthSession.objects.filter(user_id=obj.pk, revoked_at__isnull=True).update(
                    revoked_at=now,
                )

    def has_delete_permission(self, request, obj=None):
        return False
