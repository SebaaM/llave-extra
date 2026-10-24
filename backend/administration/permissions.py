from rest_framework.permissions import BasePermission


class IsProgramAdmin(BasePermission):
    message = "Se requieren privilegios de Administrador del programa."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.role == "ADMIN"
                    and user.is_staff and user.is_superuser)
