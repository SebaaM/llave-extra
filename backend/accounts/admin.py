from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class LlaveUserAdmin(UserAdmin):
    ordering = ("email",)
    list_display = ("email", "role", "is_staff", "is_active", "email_verified")
    search_fields = ("email",)
    fieldsets = ((None, {"fields": ("email", "password")}),
                 ("Perfil", {"fields": ("first_name", "last_name", "role", "email_verified")}),
                 ("Permisos", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}))
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role")}),)
