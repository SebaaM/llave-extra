import uuid

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from administration.commands import record_audit
from providers.access import locked_owned_provider, owned_provider
from providers.models import Benefit

from .models import BenefitCommissionRule
from .serializers import RateField, StrictCommandSerializer
from .services import _command_replay, _save_command, conflict, digest, global_rate
from .views import IDEMPOTENCY_KEY, PrivateView


class BenefitRateRequest(StrictCommandSerializer):
    rate = serializers.ChoiceField(choices=(3, 7, 10), allow_null=True)
    version = serializers.UUIDField(allow_null=True)


class BenefitRateResponse(BenefitRateRequest):
    global_rate = RateField()


def _rule_data(rule):
    return {
        "rate": rule.rate if rule else None,
        "version": str(rule.version) if rule else None,
        "global_rate": str(global_rate()),
    }


@transaction.atomic
def _set_rate(user, provider_id, benefit_id, *, key, data):
    provider = locked_owned_provider(user, provider_id)
    benefit = get_object_or_404(Benefit.objects.select_for_update(), provider=provider, pk=benefit_id)
    fingerprint = digest("benefit-rate", [benefit_id, data])
    replay = _command_replay(user, key, fingerprint)
    if replay is not None:
        return replay

    rule = BenefitCommissionRule.objects.filter(benefit=benefit).first()
    if data["version"] != (rule.version if rule else None):
        conflict("La regla cambió. Recargala antes de guardar.")
    previous_rate = rule.rate if rule else None
    rate = data["rate"]
    if previous_rate != rate:
        if rule is None:
            rule = BenefitCommissionRule.objects.create(benefit=benefit, rate=rate)
        else:
            rule.rate, rule.version = rate, uuid.uuid4()
            rule.save(update_fields=["rate", "version"])
        before = "global" if previous_rate is None else f"{previous_rate} %"
        after = "global" if rate is None else f"{rate} %"
        record_audit(user, "benefit-commission-rate.update", "benefits", benefit.pk, ("rate",), f"{before} → {after}")
    return _save_command(user, key, fingerprint, _rule_data(rule))


class BenefitRateView(PrivateView):
    admin = False

    @extend_schema(responses=BenefitRateResponse)
    def get(self, request, provider_id, benefit_id):
        provider = owned_provider(request.user, provider_id)
        benefit = get_object_or_404(Benefit, provider=provider, pk=benefit_id)
        return Response(_rule_data(BenefitCommissionRule.objects.filter(benefit=benefit).first()))

    @extend_schema(request=BenefitRateRequest, responses=BenefitRateResponse, parameters=[IDEMPOTENCY_KEY])
    def put(self, request, provider_id, benefit_id):
        serializer = BenefitRateRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(_set_rate(
            request.user, provider_id, benefit_id,
            key=request.headers.get("Idempotency-Key"), data=serializer.validated_data,
        ))
