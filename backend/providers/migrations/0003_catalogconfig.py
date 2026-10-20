from django.db import migrations, models
from django.db.models import Q


def create_catalog_config(apps, schema_editor):
    apps.get_model("providers", "CatalogConfig").objects.using(schema_editor.connection.alias).get_or_create(
        singleton=1, defaults={"enabled": True}
    )


class Migration(migrations.Migration):
    dependencies = [("providers", "0002_alter_benefit_image_alter_provider_image")]

    operations = [
        migrations.CreateModel(
            name="CatalogConfig",
            fields=[
                ("singleton", models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ("enabled", models.BooleanField(default=True)),
            ],
            options={
                "verbose_name": "Configuración del catálogo público",
                "verbose_name_plural": "Configuración del catálogo público",
                "constraints": [models.CheckConstraint(condition=Q(singleton=1), name="catalog_config_singleton")],
            },
        ),
        migrations.RunPython(create_catalog_config, migrations.RunPython.noop),
    ]
