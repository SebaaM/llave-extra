from django.db import migrations, models
from django.db.models import Q

GUARD = """
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
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       {benefit_checks} THEN
        RAISE EXCEPTION 'El consumo histórico es inmutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


class Migration(migrations.Migration):
    dependencies = [("credits", "0009_alter_adjustmentcase_options_and_more")]

    operations = [
        migrations.AddField(
            model_name="consumption", name="benefit_id",
            field=models.UUIDField("Identificador histórico del beneficio", blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="consumption", name="benefit_title",
            field=models.CharField("Título histórico del beneficio", blank=True, editable=False, max_length=200),
        ),
        migrations.AddField(
            model_name="consumption", name="benefit_demo",
            field=models.BooleanField("Beneficio de demostración", default=False, editable=False),
        ),
        migrations.AddConstraint(
            model_name="consumption",
            constraint=models.CheckConstraint(
                condition=(Q(benefit_id__isnull=True, benefit_title="", benefit_demo=False)
                           | (Q(benefit_id__isnull=False, collaborator__isnull=False) & ~Q(benefit_title=""))),
                name="consumption_benefit_snapshot_complete",
            ),
        ),
        migrations.RunSQL(
            sql=GUARD.format(benefit_checks="""
       OR OLD.benefit_id IS DISTINCT FROM NEW.benefit_id
       OR OLD.benefit_title IS DISTINCT FROM NEW.benefit_title
       OR OLD.benefit_demo IS DISTINCT FROM NEW.benefit_demo"""),
            reverse_sql=GUARD.format(benefit_checks=""),
        ),
    ]
