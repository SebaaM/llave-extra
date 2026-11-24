from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("providers", "0007_benefit_featured")]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE providers_benefit ADD COLUMN featured_slot smallint;

                WITH ranked AS (
                    SELECT benefit.id, row_number() OVER (
                        ORDER BY provider.name, benefit.title, benefit.id
                    ) AS position
                    FROM providers_benefit benefit
                    JOIN providers_provider provider ON provider.id = benefit.provider_id
                    WHERE benefit.featured
                )
                UPDATE providers_benefit benefit
                SET featured = ranked.position <= 5,
                    featured_slot = CASE WHEN ranked.position <= 5 THEN ranked.position END
                FROM ranked WHERE benefit.id = ranked.id;

                ALTER TABLE providers_benefit
                    ADD CONSTRAINT benefit_featured_slot_unique UNIQUE (featured_slot),
                    ADD CONSTRAINT benefit_featured_slot_valid CHECK (
                        (NOT featured AND featured_slot IS NULL)
                        OR (featured AND featured_slot IS NOT NULL AND featured_slot BETWEEN 1 AND 5)
                    );

                CREATE FUNCTION providers_assign_featured_slot() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    IF NOT NEW.featured THEN
                        NEW.featured_slot := NULL;
                        RETURN NEW;
                    END IF;
                    IF TG_OP = 'UPDATE' THEN
                        IF OLD.featured THEN
                            NEW.featured_slot := OLD.featured_slot;
                            RETURN NEW;
                        END IF;
                    END IF;

                    -- Serialize allocation across benefits, including different providers.
                    PERFORM pg_advisory_xact_lock(22108, 5);
                    SELECT slot INTO NEW.featured_slot
                    FROM generate_series(1, 5) AS slots(slot)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM providers_benefit WHERE featured_slot = slot
                    )
                    ORDER BY slot
                    LIMIT 1;

                    IF NEW.featured_slot IS NULL THEN
                        RAISE check_violation USING
                            MESSAGE = 'No hay cupos para beneficios destacados.',
                            CONSTRAINT = 'benefit_featured_slots_exhausted';
                    END IF;
                    RETURN NEW;
                END;
                $$;

                CREATE TRIGGER providers_benefit_featured_slot
                BEFORE INSERT OR UPDATE OF featured, featured_slot ON providers_benefit
                FOR EACH ROW EXECUTE FUNCTION providers_assign_featured_slot();
            """,
            reverse_sql="""
                DROP TRIGGER providers_benefit_featured_slot ON providers_benefit;
                DROP FUNCTION providers_assign_featured_slot();
                ALTER TABLE providers_benefit DROP COLUMN featured_slot;
            """,
        ),
    ]
