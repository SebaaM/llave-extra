from decimal import Decimal

from rest_framework import serializers

from .models import CommissionState, Outcome


class MoneyField(serializers.DecimalField):
    def __init__(self, **kwargs):
        super().__init__(max_digits=14, decimal_places=2, min_value=Decimal("0"), **kwargs)


class RateField(serializers.DecimalField):
    def __init__(self, **kwargs):
        super().__init__(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"), **kwargs)


class StrictCommandSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            extra = set(data) - set(self.fields)
            if extra:
                raise serializers.ValidationError("La solicitud contiene campos desconocidos.")
        return super().to_internal_value(data)


class ActionSerializer(StrictCommandSerializer):
    version = serializers.RegexField(r"\A[0-9a-f]{64}\Z", trim_whitespace=False)


class ReasonSerializer(ActionSerializer):
    reason = serializers.CharField(max_length=1000)


class ApprovalRequestSerializer(ActionSerializer):
    amount = MoneyField()
    reason = serializers.CharField(max_length=1000, allow_blank=True)


class DeclarationRequestSerializer(ActionSerializer):
    outcome = serializers.ChoiceField(choices=Outcome.choices)
    amount = MoneyField(allow_null=True)

    def validate(self, attrs):
        if attrs["outcome"] == Outcome.CONSUMED and attrs["amount"] is None:
            raise serializers.ValidationError({"amount": "Ingresá el importe aproximado, incluso si fue cero."})
        if attrs["outcome"] == Outcome.NOT_CONSUMED and attrs["amount"] is not None:
            raise serializers.ValidationError({"amount": "Dejá el importe vacío si el consumo no se concretó."})
        return attrs


class PaymentRequestSerializer(ActionSerializer):
    date = serializers.DateField()
    reference = serializers.CharField(max_length=120)
    approval_id = serializers.RegexField(r"\A[1-9][0-9]{0,18}\Z", required=False, trim_whitespace=False)
    amount = MoneyField()

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("El importe debe ser mayor que cero.")
        return value


class ReconcileRequestSerializer(ActionSerializer):
    receipt_checked = serializers.BooleanField()
    receipt_confirmed = serializers.BooleanField()


class BankRevealRequestSerializer(StrictCommandSerializer):
    reason = serializers.ChoiceField(choices=["prepare", "verify", "incident"])


class BankRevealResponseSerializer(serializers.Serializer):
    cbu = serializers.CharField()
    alias = serializers.CharField()


class RuleRequestSerializer(StrictCommandSerializer):
    version = serializers.UUIDField(allow_null=True)
    rate = RateField(allow_null=True)


class RuleSerializer(serializers.Serializer):
    provider_id = serializers.UUIDField(allow_null=True)
    provider_name = serializers.CharField(allow_null=True)
    rate = RateField(allow_null=True)
    version = serializers.UUIDField(allow_null=True)


class RuleListSerializer(serializers.Serializer):
    global_ = RuleSerializer()
    providers = RuleSerializer(many=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["global"] = fields.pop("global_")
        return fields


class EventSerializer(serializers.Serializer):
    id = serializers.CharField(allow_null=True)
    basis_id = serializers.CharField(allow_null=True)
    kind = serializers.CharField()
    label = serializers.CharField()
    created_at = serializers.DateTimeField()
    actor = serializers.CharField()
    reason = serializers.CharField()
    outcome = serializers.ChoiceField(choices=Outcome.choices, allow_null=True)
    amount = MoneyField(allow_null=True)
    base_amount = MoneyField(allow_null=True)
    rate = RateField(allow_null=True)
    reference = serializers.CharField(allow_null=True)
    date = serializers.DateField(allow_null=True)
    receipt_checked = serializers.BooleanField(allow_null=True)
    receipt_confirmed = serializers.BooleanField(allow_null=True)


class DeclarationSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=Outcome.choices)
    amount = MoneyField(allow_null=True)
    created_at = serializers.DateTimeField()


class ApprovalSerializer(serializers.Serializer):
    base_amount = MoneyField()
    rate = RateField()
    amount = MoneyField()
    created_at = serializers.DateTimeField()


class LateApprovalSerializer(ApprovalSerializer):
    id = serializers.CharField()


class PaymentSerializer(serializers.Serializer):
    approval_id = serializers.CharField(source="basis_id")
    date = serializers.DateField()
    reference = serializers.CharField()
    amount = MoneyField()
    created_at = serializers.DateTimeField()


class CommissionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    provider_id = serializers.UUIDField()
    provider_name = serializers.CharField()
    collaborator_id = serializers.UUIDField()
    collaborator_name = serializers.CharField()
    benefit_title = serializers.CharField()
    state = serializers.ChoiceField(choices=CommissionState.choices)
    next_step = serializers.CharField()
    version = serializers.CharField()
    declaration = DeclarationSerializer(allow_null=True)
    approval = ApprovalSerializer(allow_null=True)
    payment = PaymentSerializer(allow_null=True)
    payment_approvals = LateApprovalSerializer(many=True)
    events = EventSerializer(many=True)
    actions = serializers.ListField(child=serializers.CharField())
    incident = serializers.BooleanField()
    current_rate = RateField(allow_null=True)


class AdminCommissionSerializer(CommissionSerializer):
    tourist_name = serializers.CharField()
    bank_configured = serializers.BooleanField()
    bank_changed = serializers.BooleanField()


class ActionResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    state = serializers.ChoiceField(choices=CommissionState.choices)


class CommissionFilterSerializer(serializers.Serializer):
    state = serializers.ChoiceField(choices=CommissionState.choices, required=False)
    provider = serializers.UUIDField(required=False)
    collaborator = serializers.UUIDField(required=False)


ACTION_REQUESTS = {
    "declare": DeclarationRequestSerializer,
    "report-payment": PaymentRequestSerializer,
    "approve": ApprovalRequestSerializer,
    "reconcile": ReconcileRequestSerializer,
    "request-correction": ReasonSerializer,
    "complete-no-commission": ReasonSerializer,
    "reopen": ReasonSerializer,
    "reject-report": ReasonSerializer,
    "open-incident": ReasonSerializer,
    "close-incident": ReasonSerializer,
}
