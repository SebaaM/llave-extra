from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("providers", "0006_folder_benefit_and_unique_business")]

    operations = [
        migrations.AddField(
            model_name="benefit",
            name="featured",
            field=models.BooleanField(default=False, verbose_name="Destacado en el inicio"),
        ),
    ]
