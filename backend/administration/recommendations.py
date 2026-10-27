from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from providers.access import selected_benefits
from providers.models import FolderBenefit
from referrals.models import CollaboratorProfile

from .permissions import IsProgramAdmin
from .resource_serializers import BenefitReadSerializer


class RecommendationItem(serializers.Serializer):
    benefit_id = serializers.UUIDField()
    available = serializers.BooleanField()
    benefit = BenefitReadSerializer(allow_null=True)


class RecommendationsResponse(serializers.Serializer):
    recommendations = RecommendationItem(many=True)


class AdminRecommendationsView(APIView):
    permission_classes = [IsProgramAdmin]

    @extend_schema(responses={200: RecommendationsResponse})
    def get(self, request, pk):
        get_object_or_404(CollaboratorProfile, pk=pk)
        eligible = {benefit.pk: benefit for benefit in selected_benefits(pk)}
        rows = FolderBenefit.objects.filter(collaborator_id=pk).order_by("created_at", "pk")
        return Response({"recommendations": [
            {"benefit_id": str(row.benefit_id), "available": row.benefit_id in eligible,
             "benefit": BenefitReadSerializer(eligible[row.benefit_id]).data if row.benefit_id in eligible else None}
            for row in rows
        ]})
