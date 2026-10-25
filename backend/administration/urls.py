from django.urls import path

from .dashboard import DashboardView
from .invitations import InviteView
from .media import AdminImageView, AdminQRPNGView, AdminQRView
from .operations import ACTION_INPUT, action_endpoint
from .recommendations import AdminRecommendationsView
from .resources import (
    AdjustmentsView,
    BenefitsView,
    CancellationsView,
    CollaboratorsView,
    ConsumptionsView,
    CreditRulesView,
    OrdersView,
    PaymentOperationsView,
    ProductsView,
    ProvidersView,
    StockAdjustmentsView,
    UsersView,
    WalletsView,
    resource_endpoint,
)
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
    path("admin/dashboard/", DashboardView.as_view(), name="admin-dashboard"),
    path("admin/users/<int:pk>/invite/", InviteView.as_view(), name="admin-user-invite"),
    path("admin/collaborators/<uuid:pk>/recommendations/", AdminRecommendationsView.as_view(), name="admin-recommendations"),
    path("admin/<str:resource>/<uuid:pk>/image/", AdminImageView.as_view(), name="admin-resource-image"),
    path("admin/<str:resource>/<uuid:pk>/qr/", AdminQRView.as_view(), name="admin-resource-qr"),
    path("admin/<str:resource>/<uuid:pk>/qr.png", AdminQRPNGView.as_view(), name="admin-resource-qr-png"),
    path("admin/users/", resource_endpoint(UsersView, detail=False), name="admin-users"),
    path("admin/users/<int:pk>/", resource_endpoint(UsersView, detail=True), name="admin-user"),
    path("admin/providers/", resource_endpoint(ProvidersView, detail=False), name="admin-providers"),
    path("admin/providers/<uuid:pk>/", resource_endpoint(ProvidersView, detail=True), name="admin-provider"),
    path("admin/benefits/", resource_endpoint(BenefitsView, detail=False), name="admin-benefits"),
    path("admin/benefits/<uuid:pk>/", resource_endpoint(BenefitsView, detail=True), name="admin-benefit"),
    path("admin/collaborators/", resource_endpoint(CollaboratorsView, detail=False), name="admin-collaborators"),
    path("admin/collaborators/<uuid:pk>/", resource_endpoint(CollaboratorsView, detail=True), name="admin-collaborator"),
    path("admin/consumptions/", resource_endpoint(ConsumptionsView, detail=False), name="admin-consumptions"),
    path("admin/consumptions/<uuid:pk>/", resource_endpoint(ConsumptionsView, detail=True), name="admin-consumption"),
    path("admin/wallets/", resource_endpoint(WalletsView, detail=False), name="admin-wallets"),
    path("admin/wallets/<int:pk>/", resource_endpoint(WalletsView, detail=True), name="admin-wallet"),
    path("admin/adjustments/", resource_endpoint(AdjustmentsView, detail=False), name="admin-adjustments"),
    path("admin/adjustments/<int:pk>/", resource_endpoint(AdjustmentsView, detail=True), name="admin-adjustment"),
    path("admin/products/", resource_endpoint(ProductsView, detail=False), name="admin-products"),
    path("admin/products/<uuid:pk>/", resource_endpoint(ProductsView, detail=True), name="admin-product"),
    path("admin/orders/", resource_endpoint(OrdersView, detail=False), name="admin-orders"),
    path("admin/orders/<uuid:pk>/", resource_endpoint(OrdersView, detail=True), name="admin-order"),
    path("admin/cancellations/", resource_endpoint(CancellationsView, detail=False), name="admin-cancellations"),
    path("admin/cancellations/<int:pk>/", resource_endpoint(CancellationsView, detail=True), name="admin-cancellation"),
    path("admin/credit-rules/", resource_endpoint(CreditRulesView, detail=False), name="admin-credit-rules"),
    path("admin/credit-rules/<int:pk>/", resource_endpoint(CreditRulesView, detail=True), name="admin-credit-rule"),
    path("admin/stock-adjustments/", resource_endpoint(StockAdjustmentsView, detail=False), name="admin-stock-adjustments"),
    path("admin/stock-adjustments/<int:pk>/", resource_endpoint(StockAdjustmentsView, detail=True), name="admin-stock-adjustment"),
    path("admin/payment-operations/", resource_endpoint(PaymentOperationsView, detail=False), name="admin-payment-operations"),
    path("admin/payment-operations/<uuid:pk>/", resource_endpoint(PaymentOperationsView, detail=True), name="admin-payment-operation"),
]

for resource, action in ACTION_INPUT:
    converter = "int" if resource in ("adjustments", "cancellations", "credit-rules") else "uuid"
    urlpatterns.append(path(
        f"admin/{resource}/<{converter}:pk>/actions/{action}/",
        action_endpoint(resource, action),
        name=f"admin-{resource}-{action}",
    ))
