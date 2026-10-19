import logging
import socket
from ipaddress import ip_address

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from referrals.access import redeem_qr

from .authentication import SessionJWTAuthentication
from .models import AuthSession, OneTimeToken
from .security import (
    InvalidSession,
    consume_one_time_token,
    issue_session,
    make_one_time_token,
    rate_limit,
    revoke_session,
    rotate_session,
    send_token_email,
)
from .serializers import (
    EmailSerializer,
    LoginSerializer,
    RegisterSerializer,
    ResetSerializer,
    TokenSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def client_origin(request):
    peer = request.META.get("REMOTE_ADDR", "unknown")
    forwarded = request.META.get("HTTP_X_LLAVE_CLIENT_IP")
    trusted_host = settings.TRUSTED_PROXY_HOST
    if not forwarded or not trusted_host:
        return peer
    try:
        peer_ip = ip_address(peer)
        proxy_ips = {ip_address(info[4][0]) for info in socket.getaddrinfo(trusted_host, None, type=socket.SOCK_STREAM)}
        if peer_ip in proxy_ips:
            return str(ip_address(forwarded))
    except (ValueError, OSError):
        pass
    return peer


def identity(request, email=""):
    return f"{client_origin(request)}:{email.strip().lower()}"


def limit_auth_operation(scope, request, email):
    # Dos cuotas independientes: variar emails no elude el origen, y variar IPs
    # no elude la cuota de una cuenta. rate_limit usa Redis/Lua atómico.
    rate_limit(scope, f"origin:{client_origin(request)}")
    rate_limit(scope, f"account:{email.strip().lower()}")


def private_response(data, status_code=status.HTTP_200_OK):
    response = Response(data, status=status_code)
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response


def set_refresh_cookie(response, value):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME, value, max_age=7 * 24 * 3600,
        httponly=True, secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE, path="/api/v1/auth/",
    )


@method_decorator([ensure_csrf_cookie, never_cache], name="dispatch")
class CSRFView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(responses={200: None}, auth=[])
    def get(self, request):
        return private_response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=RegisterSerializer, responses={201: None}, auth=[])
    def post(self, request):
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].strip().lower()
        if data.validated_data.get("referral_token"):
            rate_limit("redeem", identity(request))
        try:
            with transaction.atomic():
                user = User.objects.create_user(email, data.validated_data["password"], role=User.Role.TOURIST)
                if token := data.validated_data.get("referral_token"):
                    redeem_qr(user, token)
                raw = make_one_time_token(user, OneTimeToken.Purpose.VERIFY)
        except IntegrityError:
            raise ValidationError({"email": "Email ya registrado"}) from None
        try:
            send_token_email(user, OneTimeToken.Purpose.VERIFY, raw)
        except Exception:
            logger.exception("Fallo el envio de email de verificacion para user_id=%s", user.pk)
            return private_response({"detail": "Cuenta creada; reintentá el envío de verificación"}, status.HTTP_503_SERVICE_UNAVAILABLE)
        return private_response({"id": user.pk, "email": user.email, "role": user.role}, status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=LoginSerializer, responses={200: None}, auth=[])
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].strip().lower()
        limit_auth_operation("login", request, email)
        user = authenticate(request, email=email, password=data.validated_data["password"])
        if user is None or not user.is_active:
            raise InvalidSession("Credenciales inválidas")
        access, refresh = issue_session(user)
        response = private_response({"access": access, "token_type": "Bearer", "expires_in": 300})
        set_refresh_cookie(response, refresh)
        return response


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: None})
    def get(self, request):
        user = request.user
        return private_response({"id": user.pk, "email": user.email, "role": user.role,
                                 "email_verified": user.email_verified})


@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses={200: None}, auth=[])
    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            raise InvalidSession()
        access, refresh = rotate_session(raw)
        response = private_response({"access": access, "token_type": "Bearer", "expires_in": 300})
        set_refresh_cookie(response, refresh)
        return response


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = [SessionJWTAuthentication]

    @extend_schema(request=None, responses={204: None}, auth=[])
    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            revoke_session(raw)
        elif request.auth:
            AuthSession.objects.filter(id=request.auth["sid"], user=request.user).update(revoked_at=timezone.now())
        response = private_response(None, status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/api/v1/auth/", samesite=settings.REFRESH_COOKIE_SAMESITE)
        return response


@method_decorator(csrf_protect, name="dispatch")
class ResendView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=EmailSerializer, responses={202: None}, auth=[])
    def post(self, request):
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].strip().lower()
        limit_auth_operation("resend", request, email)
        user = User.objects.filter(email=email, is_active=True, email_verified=False).first()
        if user:
            raw = make_one_time_token(user, OneTimeToken.Purpose.VERIFY)
            try:
                send_token_email(user, OneTimeToken.Purpose.VERIFY, raw)
            except Exception:
                logger.exception("Fallo reenvio de verificacion para user_id=%s", user.pk)
        return private_response({"detail": "Si corresponde, recibirás un email"}, status.HTTP_202_ACCEPTED)


@method_decorator(csrf_protect, name="dispatch")
class VerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=TokenSerializer, responses={200: None}, auth=[])
    def post(self, request):
        data = TokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            user = consume_one_time_token(data.validated_data["token"], OneTimeToken.Purpose.VERIFY)
            user.email_verified = True
            user.save(update_fields=["email_verified"])
            OneTimeToken.objects.filter(user=user, purpose=OneTimeToken.Purpose.VERIFY, used_at__isnull=True).update(used_at=timezone.now())
        return private_response({"detail": "Email verificado"})


@method_decorator(csrf_protect, name="dispatch")
class ForgotView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=EmailSerializer, responses={202: None}, auth=[])
    def post(self, request):
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].strip().lower()
        limit_auth_operation("reset", request, email)
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            raw = make_one_time_token(user, OneTimeToken.Purpose.RESET)
            try:
                send_token_email(user, OneTimeToken.Purpose.RESET, raw)
            except Exception:
                logger.exception("Fallo envio de reset para user_id=%s", user.pk)
        return private_response({"detail": "Si corresponde, recibirás un email"}, status.HTTP_202_ACCEPTED)


@method_decorator(csrf_protect, name="dispatch")
class ResetView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=ResetSerializer, responses={200: None}, auth=[])
    def post(self, request):
        data = ResetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        rate_limit("reset_submit", f"origin:{client_origin(request)}")
        with transaction.atomic():
            user = consume_one_time_token(data.validated_data["token"], OneTimeToken.Purpose.RESET)
            validate_password(data.validated_data["password"], user)
            user.set_password(data.validated_data["password"])
            user.save(update_fields=["password"])
            now = timezone.now()
            AuthSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=now)
            OneTimeToken.objects.filter(user=user, purpose=OneTimeToken.Purpose.RESET, used_at__isnull=True).update(used_at=now)
        return private_response({"detail": "Contraseña actualizada"})
