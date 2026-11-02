import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_featured_migration_preserves_existing_offers_without_automatic_selection():
    executor = MigrationExecutor(connection)
    original_targets = executor.loader.graph.leaf_nodes()
    before = [("providers", "0006_folder_benefit_and_unique_business")]
    after = [("providers", "0007_benefit_featured")]
    try:
        executor.migrate(before)
        old_apps = executor.loader.project_state(before).apps
        provider = old_apps.get_model("providers", "Provider").objects.create(
            slug="migration-featured", name="Negocio previo", status="PUBLISHED",
        )
        old_benefit = old_apps.get_model("providers", "Benefit")
        existing = [old_benefit.objects.create(provider=provider, title=status, conditions="Sí", status=status)
                    for status in ("PUBLISHED", "DRAFT", "INACTIVE")]
        executor = MigrationExecutor(connection)
        executor.migrate(after)
        migrated = executor.loader.project_state(after).apps.get_model("providers", "Benefit")
        assert migrated.objects.count() == 3
        assert list(migrated.objects.order_by("title").values_list("status", "featured")) == [
            ("DRAFT", False), ("INACTIVE", False), ("PUBLISHED", False),
        ]
        assert set(migrated.objects.values_list("pk", flat=True)) == {row.pk for row in existing}
        assert migrated.objects.create(provider_id=provider.pk, title="Nueva").featured is False
    finally:
        MigrationExecutor(connection).migrate(original_targets)
