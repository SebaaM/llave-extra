from django.urls import path

from .views import (
                    CollaboratorFolderView,
                    CollaboratorProviderMediaView,
                    FolderBenefitMediaView,
                    FolderBenefitsView,
                    FolderBenefitView,
                    FolderProviderMediaView,
                    FolderProvidersView,
                    FolderProviderView,
                    OwnBenefitMediaView,
                    OwnBenefitsView,
                    OwnBenefitView,
                    OwnProviderMediaView,
                    OwnProvidersView,
                    OwnProviderView,
                    admin_private_media,
)

urlpatterns = [
    path("admin/private-media/<path:name>", admin_private_media, name="admin-private-media"),
    path("folders/<uuid:folder_id>/providers/", FolderProvidersView.as_view()),
    path("folders/<uuid:folder_id>/providers/<uuid:provider_id>/", FolderProviderView.as_view()),
    path("folders/<uuid:folder_id>/providers/<uuid:provider_id>/media/", FolderProviderMediaView.as_view(), name="folder-provider-media"),
    path("folders/<uuid:folder_id>/providers/<uuid:provider_id>/benefits/", FolderBenefitsView.as_view()),
    path("folders/<uuid:folder_id>/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/", FolderBenefitView.as_view()),
    path("folders/<uuid:folder_id>/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/media/", FolderBenefitMediaView.as_view(), name="folder-benefit-media"),
    path("provider/providers/", OwnProvidersView.as_view()),
    path("provider/providers/<uuid:provider_id>/", OwnProviderView.as_view()),
    path("provider/providers/<uuid:provider_id>/media/", OwnProviderMediaView.as_view(), name="owned-provider-media"),
    path("provider/providers/<uuid:provider_id>/benefits/", OwnBenefitsView.as_view()),
    path("provider/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/", OwnBenefitView.as_view()),
    path("provider/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/media/", OwnBenefitMediaView.as_view(), name="owned-benefit-media"),
    path("collaborator/folder/", CollaboratorFolderView.as_view()),
    path("collaborator/folder/providers/<uuid:provider_id>/media/", CollaboratorProviderMediaView.as_view(), name="collaborator-provider-media"),
]
