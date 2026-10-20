from io import StringIO

import pytest
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from providers.management.commands.seed_demo_media import FIXTURE_DIR
from providers.models import Benefit, Provider


@pytest.mark.django_db
def test_seed_demo_media_fills_only_empty_demo_fields_and_is_repeatable(tmp_path):
    demo = Provider.objects.create(legacy_public_id="KUA001", slug="kuar-media", name="Kuar", demo=True)
    offer = Benefit.objects.create(provider=demo, title="Beneficio demo", conditions="Condición", demo=True)
    real = Provider.objects.create(legacy_public_id="ANT007", slug="real-media", name="Real", demo=False)
    edited = Provider.objects.create(legacy_public_id="CUM001", slug="edited-media", name="Editado", demo=True)
    with override_settings(DEBUG=True, PRIVATE_MEDIA_ROOT=tmp_path):
        edited.image.save("edited.png", ContentFile((FIXTURE_DIR / "kuar-logo.png").read_bytes(), name="edited.png"))
        edited_path = edited.image.name
        output = StringIO()
        call_command("seed_demo_media", stdout=output)
        demo.refresh_from_db()
        offer.refresh_from_db()
        real.refresh_from_db()
        edited.refresh_from_db()
        assert demo.image.name and offer.image.name
        assert not real.image
        assert edited.image.name == edited_path
        assert "Medios demo agregados: 2" in output.getvalue()

        first_provider_path = demo.image.name
        first_offer_path = offer.image.name
        output = StringIO()
        call_command("seed_demo_media", stdout=output)
        demo.refresh_from_db()
        offer.refresh_from_db()
        assert demo.image.name == first_provider_path
        assert offer.image.name == first_offer_path
        assert "Medios demo agregados: 0" in output.getvalue()


@pytest.mark.django_db
def test_seed_demo_media_rejects_non_debug(tmp_path):
    with override_settings(DEBUG=False, PRIVATE_MEDIA_ROOT=tmp_path), pytest.raises(CommandError):
        call_command("seed_demo_media")
