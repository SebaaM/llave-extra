from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_collaboratorbankdetails"),
        ("commissions", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE FUNCTION commissions_append_only() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'El historial de comisiones no puede modificarse';
                END;
                $$;

                CREATE TRIGGER commissions_event_append_only
                BEFORE UPDATE OR DELETE ON commissions_commissionevent
                FOR EACH ROW EXECUTE FUNCTION commissions_append_only();

                CREATE TRIGGER commissions_reference_append_only
                BEFORE UPDATE OR DELETE ON commissions_paymentreference
                FOR EACH ROW EXECUTE FUNCTION commissions_append_only();

                CREATE TRIGGER commissions_command_append_only
                BEFORE UPDATE OR DELETE ON commissions_commissioncommand
                FOR EACH ROW EXECUTE FUNCTION commissions_append_only();

                CREATE FUNCTION commissions_validate_event() RETURNS trigger
                LANGUAGE plpgsql AS $$
                DECLARE
                    origin_kind varchar(32);
                BEGIN
                    IF NEW.basis_id IS NOT NULL THEN
                        SELECT kind INTO origin_kind FROM commissions_commissionevent
                        WHERE id = NEW.basis_id AND commission_id = NEW.commission_id;
                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'El evento de origen pertenece a otra comisión';
                        END IF;
                        IF (NEW.kind = 'APPROVED' AND origin_kind <> 'DECLARED')
                           OR (NEW.kind IN ('PAYMENT_REPORTED', 'LATE_PAYMENT_REPORTED') AND origin_kind <> 'APPROVED')
                           OR (NEW.kind = 'PAYMENT_RECONCILED'
                               AND origin_kind NOT IN ('PAYMENT_REPORTED', 'LATE_PAYMENT_REPORTED')) THEN
                            RAISE EXCEPTION 'El tipo de evento de origen es inválido';
                        END IF;
                    END IF;
                    IF NEW.kind = 'APPROVED' AND NEW.amount <> ROUND(NEW.base_amount * NEW.rate / 100, 2) THEN
                        RAISE EXCEPTION 'El importe aprobado no coincide con el cálculo de comisión';
                    END IF;
                    RETURN NEW;
                END;
                $$;

                CREATE TRIGGER commissions_event_validate
                BEFORE INSERT ON commissions_commissionevent
                FOR EACH ROW EXECUTE FUNCTION commissions_validate_event();

                CREATE FUNCTION commissions_validate_case() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    IF TG_OP = 'UPDATE' AND OLD.consumption_id IS DISTINCT FROM NEW.consumption_id THEN
                        RAISE EXCEPTION 'El consumo de una comisión es inmutable';
                    END IF;
                    IF TG_OP = 'INSERT' AND NOT EXISTS (
                        SELECT FROM credits_consumption WHERE id = NEW.consumption_id
                        AND collaborator_id IS NOT NULL AND benefit_id IS NOT NULL AND NOT benefit_demo
                        AND state = 'VALID'
                    ) THEN
                        RAISE EXCEPTION 'El consumo no es elegible para comisión';
                    END IF;
                    IF NEW.declaration_id IS NOT NULL AND NOT EXISTS (
                        SELECT FROM commissions_commissionevent WHERE id = NEW.declaration_id
                        AND commission_id = NEW.consumption_id AND kind = 'DECLARED'
                    ) THEN
                        RAISE EXCEPTION 'La declaración vigente no corresponde a esta comisión';
                    END IF;
                    IF NEW.approval_id IS NOT NULL AND NOT EXISTS (
                        SELECT FROM commissions_commissionevent WHERE id = NEW.approval_id
                        AND commission_id = NEW.consumption_id AND kind = 'APPROVED'
                        AND basis_id = NEW.declaration_id
                    ) THEN
                        RAISE EXCEPTION 'La aprobación vigente no corresponde a la declaración';
                    END IF;
                    IF NEW.payment_id IS NOT NULL AND NOT EXISTS (
                        SELECT FROM commissions_commissionevent WHERE id = NEW.payment_id
                        AND commission_id = NEW.consumption_id AND kind IN ('PAYMENT_REPORTED', 'LATE_PAYMENT_REPORTED')
                        AND (basis_id = NEW.approval_id OR (NEW.state = 'ANNULLED' AND kind = 'LATE_PAYMENT_REPORTED'))
                    ) THEN
                        RAISE EXCEPTION 'El informe vigente no corresponde a la aprobación';
                    END IF;
                    IF NEW.last_event_id IS NOT NULL AND NOT EXISTS (
                        SELECT FROM commissions_commissionevent WHERE id = NEW.last_event_id
                        AND commission_id = NEW.consumption_id
                    ) THEN
                        RAISE EXCEPTION 'El último evento no corresponde a esta comisión';
                    END IF;
                    RETURN NEW;
                END;
                $$;

                CREATE TRIGGER commissions_case_validate
                BEFORE INSERT OR UPDATE ON commissions_commission
                FOR EACH ROW EXECUTE FUNCTION commissions_validate_case();
            """,
            reverse_sql="""
                DROP TRIGGER commissions_case_validate ON commissions_commission;
                DROP FUNCTION commissions_validate_case();
                DROP TRIGGER commissions_event_validate ON commissions_commissionevent;
                DROP FUNCTION commissions_validate_event();
                DROP TRIGGER commissions_command_append_only ON commissions_commissioncommand;
                DROP TRIGGER commissions_reference_append_only ON commissions_paymentreference;
                DROP TRIGGER commissions_event_append_only ON commissions_commissionevent;
                DROP FUNCTION commissions_append_only();
            """,
        ),
    ]
