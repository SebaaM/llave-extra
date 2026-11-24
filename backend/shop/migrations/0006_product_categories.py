import uuid

import django.db.models.deletion
import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("shop", "0005_payment_confirmation_history")]

    operations = [
        migrations.CreateModel(
            name="ProductCategory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, verbose_name="Identificador")),
                ("name", models.CharField(max_length=160, verbose_name="Nombre")),
                ("active", models.BooleanField(default=True, verbose_name="Activa")),
            ],
            options={"verbose_name": "Categoría de producto", "verbose_name_plural": "Categorías de productos",
                     "constraints": [models.UniqueConstraint(django.db.models.functions.text.Lower(django.db.models.functions.text.Trim("name")), name="shop_category_name_unique")]},
        ),
        migrations.AddField(model_name="product", name="category", field=models.ForeignKey(blank=True, null=True,
            on_delete=django.db.models.deletion.PROTECT, related_name="products", to="shop.productcategory", verbose_name="Categoría")),
        migrations.AddField(model_name="shopsettings", name="low_stock_threshold", field=models.PositiveIntegerField(default=5, verbose_name="Umbral de stock bajo")),
    ]
