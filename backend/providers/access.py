from contextlib import contextmanager

from django.db import models
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from accounts.models import User
from referrals.access import active_folder_access, locked_folder_access
from referrals.models import CollaboratorProfile

from .models import Benefit, Provider, Publication


def selected_benefits(profile_id):
    from .catalog import catalog_benefits

    return catalog_benefits().filter(folder_selections__collaborator_id=profile_id)


def selected_providers(profile_id):
    return Provider.objects.filter(benefits__in=selected_benefits(profile_id)).distinct()


def owned_provider(user: User, provider_id) -> Provider:
    if not user.is_authenticated or not user.is_active or user.role != User.Role.PROVIDER:
        raise PermissionDenied("Solo prestadores activos")
    provider = Provider.objects.filter(pk=provider_id, memberships__user=user).first()
    if provider is None:
        raise NotFound()
    return provider


def visible_provider(user: User, profile_id, provider_id) -> Provider:
    profile = CollaboratorProfile.objects.filter(pk=profile_id).first()
    if profile is None or not active_folder_access(user, profile):
        raise NotFound()
    provider = selected_providers(profile_id).filter(pk=provider_id).first()
    if provider is None:
        raise NotFound()
    return provider


def visible_benefits(provider: Provider):
    today = timezone.localdate()
    return Benefit.objects.filter(provider=provider, status=Publication.PUBLISHED).filter(
        models.Q(valid_from__isnull=True) | models.Q(valid_from__lte=today),
        models.Q(valid_until__isnull=True) | models.Q(valid_until__gte=today),
    )


@contextmanager
def locked_provider_eligibility(user: User, profile_id, provider_id):
    """E4: lock a referred folder when supplied, then provider and current benefit."""
    if profile_id is None:
        provider = Provider.objects.select_for_update().filter(pk=provider_id).first()
        if provider is None or provider.status != Publication.PUBLISHED or not visible_benefits(provider).select_for_update().exists():
            raise PermissionDenied("Prestador sin beneficio vigente")
        yield None, provider
        return
    with locked_folder_access(user, profile_id) as profile:
        provider = Provider.objects.select_for_update().filter(pk=provider_id).first()
        if provider is None or provider.status != Publication.PUBLISHED:
            raise PermissionDenied("Prestador no habilitado para la carpeta")
        if not selected_benefits(profile.pk).filter(provider=provider).select_for_update(of=("self",)).exists():
            raise PermissionDenied("Prestador no habilitado para la carpeta: sin beneficio seleccionado vigente")
        yield profile, provider
