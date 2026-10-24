from django.urls import path

from .views import (
    ActivityView,
    CatalogSettingsView,
    CreditSettingsView,
    GeneralSettingsView,
    PublicSiteSettingsView,
    ShopSettingsView,
)

urlpatterns = [
    path("site-settings/", PublicSiteSettingsView.as_view(), name="site-settings"),
    path("admin/settings/general/", GeneralSettingsView.as_view(), name="admin-settings-general"),
    path("admin/settings/catalog/", CatalogSettingsView.as_view(), name="admin-settings-catalog"),
    path("admin/settings/credits/", CreditSettingsView.as_view(), name="admin-settings-credits"),
    path("admin/settings/shop/", ShopSettingsView.as_view(), name="admin-settings-shop"),
    path("admin/activity/", ActivityView.as_view(), name="admin-activity"),
]
