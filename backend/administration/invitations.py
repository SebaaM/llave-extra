import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OneTimeToken, User
from accounts.security import make_one_time_token, rate_limit, send_token_email
from shop.services import require_admin

from .commands import CommandResult, record_audit, run_command
from .models import AdminCommand, InvitationDelivery
from .permissions import IsProgramAdmin
from .serializers import StrictSerializer

logger = logging.getLogger(__name__)


class InviteInput(StrictSerializer):
    pass


class InviteOutput(StrictSerializer):
    id = serializers.IntegerField(read_only=True)
    delivery = serializers.ChoiceField(choices=InvitationDelivery.State.choices, read_only=True)


class InviteView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(request=InviteInput, responses={200: InviteOutput, 503: InviteOutput},
                   parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER, required=True)])
    def post(self, request, pk):
        body = InviteInput(data=request.data)
        body.is_valid(raise_exception=True)
        user = get_object_or_404(User, pk=pk)
        key = request.headers.get("Idempotency-Key")

        def create():
            require_admin(request.user)
            locked = User.objects.select_for_update().get(pk=pk)
            if not locked.is_active or locked.role == User.Role.ADMIN:
                raise ValidationError("La cuenta ya no admite invitaciones.")
            rate_limit("reset", f"admin-invite:{locked.pk}")
            raw = make_one_time_token(locked, OneTimeToken.Purpose.RESET)
            command = AdminCommand.objects.get(actor=request.user, action="users.invite", key=key)
            delivery = InvitationDelivery.objects.create(command=command, user=locked)
            record_audit(request.user, "users.invite", "users", pk)

            def send():
                try:
                    send_token_email(locked, OneTimeToken.Purpose.RESET, raw)
                    state = InvitationDelivery.State.SENT
                except Exception:
                    logger.exception("Falló el envío de invitación para user_id=%s", locked.pk)
                    state = InvitationDelivery.State.FAILED
                InvitationDelivery.objects.filter(pk=delivery.pk).update(state=state, attempted_at=timezone.now())

            transaction.on_commit(send)
            return CommandResult({"id": locked.pk, "delivery": "PENDING"})

        run_command(request.user, "users.invite", key, {"id": str(pk)}, create)
        delivery = InvitationDelivery.objects.get(command__actor=request.user,
                                                  command__action="users.invite", command__key=key)
        data = {"id": user.pk, "delivery": delivery.state}
        return Response(data, status=status.HTTP_503_SERVICE_UNAVAILABLE
                        if delivery.state == InvitationDelivery.State.FAILED else status.HTTP_200_OK)
