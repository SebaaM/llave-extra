from django.db import migrations, models

OLD_GUARD = """
CREATE OR REPLACE FUNCTION shop_order_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'El pedido histórico no puede eliminarse';
    END IF;
    IF (to_jsonb(OLD) - ARRAY['state','stock_released','remote_id','checkout_url'])
       IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['state','stock_released','remote_id','checkout_url'])
       OR (OLD.stock_released AND NOT NEW.stock_released)
       OR (OLD.remote_id <> '' AND OLD.remote_id IS DISTINCT FROM NEW.remote_id) THEN
        RAISE EXCEPTION 'La identidad y los snapshots del pedido son inmutables';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

NEW_GUARD = OLD_GUARD.replace("'checkout_url']", "'checkout_url','payment_confirmed']").replace(
    "OR (OLD.stock_released", "OR (OLD.payment_confirmed AND NOT NEW.payment_confirmed)\n       OR (OLD.stock_released"
)

# Existing PAID observations are immutable audits. Older review states may have
# seen a valid late payment without passing through PAID; preserve that too.
# Refund workflows without proof remain protected by REFUND_PENDING itself.
BACKFILL = """
UPDATE shop_order AS target SET payment_confirmed = TRUE
WHERE target.mode = 'MONEY' AND (
    target.state IN ('PAID', 'READY', 'PICKED_UP', 'REFUNDED')
    OR EXISTS (
        SELECT 1 FROM shop_orderaudit AS audit WHERE audit.order_id = target.id AND (
            audit.action IN ('PAID', 'REFUNDED')
            OR (audit.action = 'PAYMENT_REVIEW' AND audit.reason = 'late_or_reviewed_payment')
        )
    )
);
"""


class Migration(migrations.Migration):
    dependencies = [("shop", "0004_payment_contract_guards")]
    operations = [
        migrations.AddField(
            model_name="order", name="payment_confirmed",
            field=models.BooleanField(default=False, editable=False, verbose_name="Pago monetario confirmado alguna vez"),
        ),
        migrations.RunSQL(NEW_GUARD + BACKFILL, OLD_GUARD),
        migrations.AddConstraint(
            model_name="order",
            constraint=models.CheckConstraint(
                condition=~models.Q(mode="MONEY", state__in=["PAID", "READY", "PICKED_UP", "REFUNDED"]) | models.Q(payment_confirmed=True),
                name="shop_money_paid_confirmed",
            ),
        ),
    ]
