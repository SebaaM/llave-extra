from django.db import migrations

SQL = """
CREATE FUNCTION shop_payment_context_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'El contrato de pago no puede eliminarse';
    END IF;
    IF (to_jsonb(OLD) - 'version') IS DISTINCT FROM (to_jsonb(NEW) - 'version')
       OR NEW.version < OLD.version THEN
        RAISE EXCEPTION 'El request y vendedor del contrato son inmutables';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shop_payment_context_immutable BEFORE UPDATE OR DELETE ON shop_paymentcontext
FOR EACH ROW EXECUTE FUNCTION shop_payment_context_guard();
CREATE FUNCTION shop_inbox_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'La notificación no puede eliminarse';
    END IF;
    IF NEW.remote_id IS DISTINCT FROM OLD.remote_id OR NEW.delivery IS DISTINCT FROM OLD.delivery
       OR NEW.received_at IS DISTINCT FROM OLD.received_at OR (OLD.done AND NOT NEW.done)
       OR NEW.attempts < OLD.attempts THEN
        RAISE EXCEPTION 'La identidad de notificación es inmutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shop_inbox_immutable BEFORE UPDATE OR DELETE ON shop_paymentinbox
FOR EACH ROW EXECUTE FUNCTION shop_inbox_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("shop", "0003_payment_recovery")]
    operations = [migrations.RunSQL(SQL, """
        DROP TRIGGER shop_inbox_immutable ON shop_paymentinbox;
        DROP FUNCTION shop_inbox_guard();
        DROP TRIGGER shop_payment_context_immutable ON shop_paymentcontext;
        DROP FUNCTION shop_payment_context_guard();
    """)]
