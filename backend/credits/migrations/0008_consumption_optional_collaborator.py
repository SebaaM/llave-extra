import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("credits", "0007_guard_consumption_identity")]

    operations = [
        migrations.AlterField(
            model_name="consumption",
            name="collaborator",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                    to="referrals.collaboratorprofile"),
        ),
    ]
