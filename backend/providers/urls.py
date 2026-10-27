from django.urls import path

from .catalog_views import (
    CatalogBenefitMediaView,
    CatalogBenefitsView,
    CatalogBenefitView,
    CatalogCategoriesView,
    CatalogConfigView,
    CatalogProviderMediaView,
)
from .network import FolderNetworkView, NetworkView
from .recommendations import (
    CollaboratorCatalogView,
    CollaboratorRecommendationMediaView,
    CollaboratorRecommendationsView,
    CollaboratorRecommendationView,
)
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
    path("collaborator/catalog/benefits/", CollaboratorCatalogView.as_view()),
    path("collaborator/recommendations/", CollaboratorRecommendationsView.as_view()),
    path("collaborator/recommendations/<uuid:benefit_id>/", CollaboratorRecommendationView.as_view()),
    path("collaborator/recommendations/<uuid:benefit_id>/media/", CollaboratorRecommendationMediaView.as_view(), name="collaborator-recommendation-media"),
    path("catalog/config/", CatalogConfigView.as_view(), name="catalog-config"),
    path("catalog/categories/", CatalogCategoriesView.as_view(), name="catalog-categories"),
    path("catalog/network/", NetworkView.as_view(), name="catalog-network"),
    path("catalog/benefits/", CatalogBenefitsView.as_view(), name="catalog-benefits"),
    path("catalog/benefits/<uuid:benefit_id>/", CatalogBenefitView.as_view(), name="catalog-benefit"),
    path("catalog/benefits/<uuid:benefit_id>/media/", CatalogBenefitMediaView.as_view(), name="catalog-benefit-media"),
    path("catalog/providers/<uuid:provider_id>/media/", CatalogProviderMediaView.as_view(), name="catalog-provider-media"),
    path("admin/private-media/<path:name>", admin_private_media, name="admin-private-media"),
    path("folders/<uuid:folder_id>/providers/", FolderProvidersView.as_view()),
    path("folders/<uuid:folder_id>/network/", FolderNetworkView.as_view(), name="folder-network"),
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
