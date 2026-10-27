from django.db import migrations

# JSON subtraction makes the explicitly mutable lifecycle fields reviewable. Every
# other column (including future snapshot columns) is immutable by default.
SQL = """
CREATE FUNCTION shop_history_guard() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'El historial de tienda es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION shop_order_guard() RETURNS trigger AS $$
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
CREATE TRIGGER shop_order_immutable BEFORE UPDATE OR DELETE ON shop_order
FOR EACH ROW EXECUTE FUNCTION shop_order_guard();

CREATE FUNCTION shop_operation_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'La operación de pago no puede eliminarse';
    END IF;
    IF (to_jsonb(OLD) - ARRAY['state','attempts','available_at','lease_until','lease_token','generation','last_code'])
       IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['state','attempts','available_at','lease_until','lease_token','generation','last_code'])
       OR NEW.generation < OLD.generation OR NEW.attempts < OLD.attempts THEN
        RAISE EXCEPTION 'La identidad y carga remota son inmutables';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shop_operation_immutable BEFORE UPDATE OR DELETE ON shop_paymentoperation
FOR EACH ROW EXECUTE FUNCTION shop_operation_guard();

CREATE FUNCTION shop_cancellation_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'La solicitud no puede eliminarse';
    END IF;
    IF OLD.state <> 'OPEN' OR
       (to_jsonb(OLD) - ARRAY['state','resolved_at','resolved_by_id','resolution_reason'])
       IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['state','resolved_at','resolved_by_id','resolution_reason']) THEN
        RAISE EXCEPTION 'La solicitud histórica es inmutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shop_cancellation_immutable BEFORE UPDATE OR DELETE ON shop_cancellationrequest
FOR EACH ROW EXECUTE FUNCTION shop_cancellation_guard();

CREATE FUNCTION shop_line_insert_guard() RETURNS trigger AS $$
BEGIN
    PERFORM id FROM shop_order WHERE id = NEW.order_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM shop_checkoutkey WHERE order_id = NEW.order_id) THEN
        RAISE EXCEPTION 'No se pueden agregar líneas a un pedido confirmado';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shop_line_insert BEFORE INSERT ON shop_orderline
FOR EACH ROW EXECUTE FUNCTION shop_line_insert_guard();

CREATE FUNCTION shop_order_totals_guard() RETURNS trigger AS $$
DECLARE target shop_order; line_count integer; money numeric; credits bigint;
BEGIN
    SELECT * INTO target FROM shop_order WHERE id = NEW.id;
    SELECT count(*), sum(quantity * unit_money), sum(quantity::bigint * unit_credits)
      INTO line_count, money, credits FROM shop_orderline WHERE order_id = target.id;
    IF line_count < 1 OR line_count > 20 OR
       target.total_money IS DISTINCT FROM money OR target.total_credits IS DISTINCT FROM credits OR
       NOT EXISTS (SELECT 1 FROM shop_checkoutkey WHERE order_id=target.id AND actor_id=target.customer_id) THEN
        RAISE EXCEPTION 'Pedido, líneas y clave deben confirmarse juntos con totales concordantes';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER shop_order_totals AFTER INSERT ON shop_order
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION shop_order_totals_guard();
"""

IMMUTABLE_TABLES = ("orderline", "checkoutkey", "stockadjustment", "orderaudit")
for table in IMMUTABLE_TABLES:
    SQL += f"CREATE TRIGGER shop_{table}_immutable BEFORE UPDATE OR DELETE ON shop_{table} FOR EACH ROW EXECUTE FUNCTION shop_history_guard();\n"

REVERSE = ""
for table in IMMUTABLE_TABLES:
    REVERSE += f"DROP TRIGGER shop_{table}_immutable ON shop_{table};\n"
REVERSE += """
DROP TRIGGER shop_order_totals ON shop_order;
DROP FUNCTION shop_order_totals_guard();
DROP TRIGGER shop_line_insert ON shop_orderline;
DROP FUNCTION shop_line_insert_guard();
DROP TRIGGER shop_cancellation_immutable ON shop_cancellationrequest;
DROP FUNCTION shop_cancellation_guard();
DROP TRIGGER shop_operation_immutable ON shop_paymentoperation;
DROP FUNCTION shop_operation_guard();
DROP TRIGGER shop_order_immutable ON shop_order;
DROP FUNCTION shop_order_guard();
DROP FUNCTION shop_history_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("shop", "0001_initial")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
