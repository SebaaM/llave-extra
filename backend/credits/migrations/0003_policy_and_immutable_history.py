from django.db import migrations


def create_policy(apps, schema_editor):
    apps.get_model("credits", "CreditPolicy").objects.get_or_create(singleton=1)


class Migration(migrations.Migration):
    dependencies = [("credits", "0002_consumption_consumption_annul_audit_complete")]

    operations = [
        migrations.RunPython(create_policy, migrations.RunPython.noop),
        migrations.RunSQL(
            sql="""
                CREATE FUNCTION credits_history_guard() RETURNS trigger AS $$
                BEGIN
                    RAISE EXCEPTION 'El libro de movimientos es inmutable';
                END;
                $$ LANGUAGE plpgsql;
                CREATE TRIGGER wallet_entry_immutable
                    BEFORE UPDATE OR DELETE ON credits_walletentry
                    FOR EACH ROW EXECUTE FUNCTION credits_history_guard();

                CREATE FUNCTION credits_consumption_guard() RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'El consumo histórico no puede eliminarse';
                    END IF;
                    IF OLD.state = 'ANNULLED' OR NEW.state <> 'ANNULLED'
                       OR OLD.tourist_id IS DISTINCT FROM NEW.tourist_id
                       OR OLD.provider_id IS DISTINCT FROM NEW.provider_id
                       OR OLD.collaborator_id IS DISTINCT FROM NEW.collaborator_id
                       OR OLD.award IS DISTINCT FROM NEW.award
                       OR OLD.rule_snapshot IS DISTINCT FROM NEW.rule_snapshot
                       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
                        RAISE EXCEPTION 'El consumo histórico es inmutable';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                CREATE TRIGGER consumption_immutable
                    BEFORE UPDATE OR DELETE ON credits_consumption
                    FOR EACH ROW EXECUTE FUNCTION credits_consumption_guard();
            """,
            reverse_sql="""
                DROP TRIGGER consumption_immutable ON credits_consumption;
                DROP FUNCTION credits_consumption_guard();
                DROP TRIGGER wallet_entry_immutable ON credits_walletentry;
                DROP FUNCTION credits_history_guard();
            """,
        ),
    ]
