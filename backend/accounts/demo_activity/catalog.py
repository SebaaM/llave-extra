import json
import os
import secrets
import uuid
from datetime import timedelta
from pathlib import Path

from django.core.management.base import CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from administration.models import AdminAudit
from credits.models import CreditPolicy, ProviderCreditRule
from credits.services import set_provider_pin
from providers.models import (
    Benefit,
    CatalogConfig,
    DemoSeedState,
    FolderBenefit,
    Provider,
    ProviderMembership,
    Publication,
)
from referrals.models import CollaboratorProfile
from shop.models import Product, ShopSettings
from shop.services import adjust_stock

PREFIX = "activity-demo:v1"
EMAIL_PREFIX = "activity."
NAMES = ("Lucía", "Mateo", "Valentina", "Tomás", "Sofía", "Nicolás", "Emma", "Joaquín", "Martina", "Benjamín")
SURNAMES = ("Pereyra", "Ríos", "Acosta", "Molina", "Vega", "Luna", "Navarro", "Sosa", "Castro", "Suárez")
CATEGORIES = ("Gastronomía", "Excursiones", "Artesanías", "Alojamiento", "Cafeterías", "Aventura")
BUSINESSES = ("Puerto de Sabores", "Senderos del Sur", "Taller del Viento", "Refugio Austral", "Café del Faro", "Rumbo al Bosque")


def identity(kind, index=0):
    return uuid.uuid5(uuid.NAMESPACE_URL, f"llave-extra/{PREFIX}/{kind}/{index}")


def email(kind, index=0):
    return f"activity.{kind}.{index:04d}@llaveextra.test"


class Credentials:
    """Write secrets before DB commit: a crash cannot create an inaccessible account."""

    def __init__(self, path):
        self.path = Path(path)
        try:
            self.data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {
                "kind": PREFIX, "users": {}, "pins": {},
            }
            if (not isinstance(self.data, dict) or self.data.get("kind") != PREFIX or not isinstance(self.data["users"], dict)
                    or not isinstance(self.data["pins"], dict)):
                raise ValueError
        except (ValueError, KeyError, TypeError) as exc:
            raise CommandError("El archivo de accesos no corresponde a esta demo; no se sobrescribe") from exc

    def bind_database(self):
        """Bind one private manifest to one DB, including across Compose projects."""
        prefix = f"{PREFIX}:store:"
        keys = list(DemoSeedState.objects.filter(pk__startswith=prefix).values_list("pk", flat=True))
        if len(keys) > 1:
            raise CommandError("Hay más de una identidad de carga; revisar los marcadores")
        if self.path.exists():
            if not keys or self.data.get("database_id") != keys[0][len(prefix):]:
                raise CommandError("El archivo de accesos pertenece a otra base; usá --credentials con una ruta propia")
            return
        if DemoSeedState.objects.filter(pk=f"{PREFIX}:catalog").exists():
            raise CommandError("Falta el archivo completo de accesos de esta demo; restauralo antes de reintentar")
        if not keys:
            key = prefix + str(uuid.uuid4())
            DemoSeedState.objects.create(pk=key)
        else:
            key = keys[0]
        self.data["database_id"] = key[len(prefix):]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError as exc:
            raise CommandError("Otra base creó ese archivo de accesos; elegí una ruta propia") from exc
        with os.fdopen(descriptor, "w", encoding="utf-8") as document:
            json.dump(self.data, document, ensure_ascii=False, indent=2)

    def secret(self, group, key):
        entries = self.data[group]
        if key not in entries:
            if group == "users" and User.objects.filter(email__iexact=key).exists():
                raise CommandError("Faltan accesos de una cuenta existente; restaurá el archivo local, sin rotar claves")
            entries[key] = secrets.token_urlsafe(18) if group == "users" else f"{secrets.randbelow(1_000_000):06d}"
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_name(self.path.name + ".tmp")
            # The fixed temp path is protected by the seed's PostgreSQL advisory lock.
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as document:
                json.dump(self.data, document, ensure_ascii=False, indent=2)
            os.replace(temporary, self.path)
        value = entries[key]
        if not isinstance(value, str) or not value:
            raise CommandError("El archivo de accesos tiene un valor inválido")
        return value


def create_user(credentials, kind, index, role, **extra):
    address = email(kind, index)
    if User.objects.filter(email__iexact=address).exists():
        raise CommandError(f"Colisión con cuenta existente: {address}; no se modifica")
    return User.objects.create_user(address, credentials.secret("users", address), role=role,
        first_name=NAMES[index % len(NAMES)], last_name=SURNAMES[(index // len(NAMES)) % len(SURNAMES)],
        email_verified=extra.pop("email_verified", True), **extra)


def bootstrap(credentials):
    key = f"{PREFIX}:catalog"
    if DemoSeedState.objects.filter(pk=key).exists():
        # Do not restore publication, selections, PINs or stock changed by the operator.
        return
    with transaction.atomic():
        pickup = ShopSettings.objects.filter(pk=1).first()
        if pickup and (not pickup.pickup_enabled or not pickup.pickup_name.strip() or not pickup.pickup_address.strip()):
            raise CommandError("Configurá y habilitá el retiro en backoffice; la demo no cambia tu configuración")
        admin = create_user(credentials, "admin", 0, User.Role.ADMIN, is_staff=True, is_superuser=True)
        CreditPolicy.objects.get_or_create(pk=1)
        CatalogConfig.objects.get_or_create(pk=1)
        ShopSettings.objects.get_or_create(pk=1, defaults={"pickup_enabled": True,
            "pickup_name": "DEMO — Retiro del Puerto", "pickup_address": "DEMO — Dirección ficticia 123",
            "pickup_hours": "Lunes a sábado de 10 a 18 h — DEMO"})
        primary = []
        today = timezone.localdate()
        for index in range(30):
            pk, slug = identity("provider", index), f"activity-demo-negocio-{index:02d}"
            if Provider.objects.filter(Q(pk=pk) | Q(slug=slug)).exists():
                raise CommandError("Colisión con negocio existente; la carga se revierte")
            status = Publication.PUBLISHED if index < 24 else Publication.DRAFT if index < 27 else Publication.INACTIVE
            provider = Provider.objects.create(pk=pk, slug=slug,
                name=f"DEMO — {BUSINESSES[index % 6]} {index // 6 + 1}", category=CATEGORIES[index % 6],
                description="Negocio ficticio para recorrer el catálogo y probar el backoffice.",
                address=f"DEMO — Paseo Austral {100 + index * 17}", hours="Lun–sáb 09:00–20:00", status=status, demo=True)
            owner = create_user(credentials, "prestador", index, User.Role.PROVIDER)
            ProviderMembership.objects.create(user=owner, provider=provider)
            pin = credentials.secret("pins", str(pk))
            set_provider_pin(pk, pin)
            ProviderCreditRule.objects.create(provider=provider, reward=1000 + (index % 4) * 250)
            for offer in range(2):
                benefit_id = identity("benefit", index * 2 + offer)
                if Benefit.objects.filter(pk=benefit_id).exists():
                    raise CommandError("Colisión con beneficio existente")
                variant = index % 4 if offer else 0
                benefit = Benefit.objects.create(pk=benefit_id, provider=provider,
                    title=f"{'Experiencia con 15% de descuento' if not offer else 'Propuesta de temporada'} — DEMO {index + 1}",
                    description="Presentá tu visita y consultá las condiciones de esta experiencia ficticia.",
                    conditions="DEMO: una acreditación por Cliente y negocio. No acumulable con otras promociones.",
                    status=Publication.DRAFT if variant == 3 else Publication.PUBLISHED,
                    valid_from=today + timedelta(days=15) if variant == 2 else today - timedelta(days=30),
                    valid_until=today - timedelta(days=1) if variant == 1 else today + timedelta(days=180),
                    featured=not offer and index < 6, demo=True)
                if not offer and index < 24:
                    primary.append(benefit)
            AdminAudit.objects.create(actor=admin, action="DEMO_SETUP", resource="providers", object_id=str(pk),
                changed_fields=["publication", "credit_rule"], reason="Alta ficticia y regla de créditos DEMO")
        for index in range(10):
            owner = create_user(credentials, "colaborador", index, User.Role.COLLABORATOR)
            if CollaboratorProfile.objects.filter(pk=identity("profile", index)).exists():
                raise CommandError("Colisión con perfil existente")
            profile = CollaboratorProfile.objects.create(pk=identity("profile", index), user=owner,
                enabled=index != 9, network_title=f"Recorrido DEMO {index + 1}",
                network_theme="OCEAN" if index % 2 else "SAND")
            if index < 8:
                for position, benefit in enumerate(primary):
                    if (position + index) % 3:
                        FolderBenefit.assign(profile.pk, benefit.pk)
        for index in range(12):
            if Product.objects.filter(pk=identity("product", index)).exists():
                raise CommandError("Colisión con producto existente")
            product = Product.objects.create(pk=identity("product", index),
                name=f"DEMO — {('Llavero', 'Imán', 'Miniatura', 'Señalador')[index % 4]} Austral {index + 1}",
                description="Regalería 3D ficticia. Sin validez comercial.", active=index != 10, demo=True,
                price_money=f"{1800 + index * 350}.00", price_credits=100 if index < 8 else 500)
            stock = 5000 if index < 8 else (3, 0, 20, 80)[index - 8]
            if stock:
                adjust_stock(admin, product.pk, delta=stock, reason="Stock inicial DEMO mediante ajuste auditado")
        DemoSeedState.objects.create(pk=key)
