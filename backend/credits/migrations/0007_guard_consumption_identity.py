from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("credits", "0006_walletentry_wallet_entry_kind_sign_source")]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE OR REPLACE FUNCTION credits_consumption_guard() RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'El consumo histórico no puede eliminarse';
                    END IF;
                    IF OLD.state = 'ANNULLED' OR NEW.state <> 'ANNULLED'
                       OR OLD.id IS DISTINCT FROM NEW.id
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
            """,
            # Never weaken an already installed history guard on rollback.
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
