from io import BytesIO

import qrcode
from django.conf import settings
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.security import rate_limit
from accounts.serializers import TokenSerializer

from .access import active_folder_access, redeem_qr, sign_qr
from .models import CollaboratorProfile, FolderAccess


def private(response):
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response


class RedeemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=TokenSerializer, responses={200: None})
    def post(self, request):
        rate_limit("redeem", f"{request.META.get('REMOTE_ADDR', 'unknown')}:{request.user.pk}")
        serializer = TokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grant = redeem_qr(request.user, serializer.validated_data["token"])
        return private(Response({"collaborator_id": str(grant.collaborator_id),
                                 "granted_at": grant.created_at}, status=status.HTTP_200_OK))


class FolderListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: None})
    def get(self, request):
        if request.user.role != User.Role.TOURIST:
            raise PermissionDenied("Solo turistas pueden consultar sus carpetas")
        grants = FolderAccess.objects.filter(tourist=request.user).select_related("collaborator__user").order_by("created_at")
        folders = [{"collaborator_id": str(grant.collaborator_id), "granted_at": grant.created_at}
                   for grant in grants if active_folder_access(request.user, grant.collaborator)]
        return private(Response({"folders": folders}))


def current_profile(user):
    if user.role != User.Role.COLLABORATOR:
        raise PermissionDenied("Solo colaboradores habilitados")
    profile = CollaboratorProfile.objects.select_related("user").filter(user=user, enabled=True, user__is_active=True).first()
    if not profile:
        raise PermissionDenied("Solo colaboradores habilitados")
    return profile


def qr_url(profile):
    return f"{settings.PUBLIC_APP_URL}/referencia#token={sign_qr(profile)}"


class QRView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: None})
    def get(self, request):
        return private(Response({"url": qr_url(current_profile(request.user))}))


class QRPNGView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={(200, "image/png"): bytes})
    def get(self, request):
        profile = current_profile(request.user)
        out = BytesIO()
        qrcode.make(qr_url(profile)).save(out, format="PNG")
        response = HttpResponse(out.getvalue(), content_type="image/png")
        response["Content-Disposition"] = 'attachment; filename="referencia.png"'
        return private(response)
