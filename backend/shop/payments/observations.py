from decimal import Decimal

from .contracts import GatewayError, amount, identifier


def matches(order, context, remote):
    return (remote.external_reference == str(order.pk) and remote.seller == context.seller
            and remote.currency == "ARS" and remote.country == "ARG" and remote.total == order.total_money
            and (not order.remote_id or remote.id == order.remote_id))


def financial_state(remote):
    """Fail closed: every payment/refund must agree, no favorable subset selection."""
    try:
        pair = (remote.status, remote.detail)
        if pair in {("created", "created"), ("processing", "in_process"),
                    ("action_required", "waiting_payment"), ("action_required", "waiting_transfer"),
                    ("action_required", "waiting_capture"), ("action_required", "waiting_retry"),
                    ("canceled", "canceled"), ("expired", "expired"), ("failed", "failed")}:
            return "waiting" if remote.paid == 0 and not remote.payments and not remote.refunds else "review"
        if pair not in {("processed", "accredited"), ("refunded", "refunded")} or not remote.payments:
            return "review"
        refunded = pair == ("refunded", "refunded")
        payment_ids = {}
        for payment in remote.payments:
            pk = identifier(payment["id"])
            if pk in payment_ids or (payment["status"], payment["status_detail"]) != pair:
                return "review"
            paid = amount(payment["paid_amount"])
            if paid <= 0 or amount(payment["amount"]) != paid:
                return "review"
            payment_ids[pk] = paid
        if sum(payment_ids.values(), Decimal(0)) != remote.total or remote.paid != remote.total:
            return "review"
        if not refunded:
            return "paid" if not remote.refunds else "review"
        seen = set()
        sums = dict.fromkeys(payment_ids, Decimal(0))
        for refund in remote.refunds:
            pk = identifier(refund["id"])
            transaction_id = identifier(refund["transaction_id"])
            value = amount(refund["amount"])
            if pk in seen or transaction_id not in sums or refund["status"] != "processed" or value <= 0:
                return "review"
            seen.add(pk)
            sums[transaction_id] += value
        return "refunded" if sums == payment_ids else "review"
    except (KeyError, TypeError, GatewayError):
        return "review"
