from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from credits.models import Consumption
from referrals.models import CollaboratorProfile, FolderAccess

from .permissions import IsProgramAdmin


class CollaboratorSummarySerializer(serializers.Serializer):
    collaborator_id = serializers.UUIDField()
    linked_clients = serializers.IntegerField()
    valid_attributed_consumptions = serializers.IntegerField()


class CollaboratorSummaryView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(responses={200: CollaboratorSummarySerializer})
    def get(self, request, pk):
        profile = get_object_or_404(CollaboratorProfile, pk=pk)
        # Conteos separados evitan multiplicar vínculos por consumos y conservan historia.
        return Response({
            "collaborator_id": str(profile.pk),
            "linked_clients": FolderAccess.objects.filter(collaborator=profile).values("tourist_id").distinct().count(),
            "valid_attributed_consumptions": Consumption.objects.filter(collaborator=profile, state=Consumption.State.VALID).count(),
        })
