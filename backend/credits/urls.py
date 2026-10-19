from django.urls import path

from .views import (
    ConsumptionView,
    MyConsumptionsView,
    ProgressView,
    ProviderCredentialView,
    WalletView,
)

urlpatterns = [
    path("consumptions/", ConsumptionView.as_view()),
    path("me/wallet/", WalletView.as_view()),
    path("me/consumptions/", MyConsumptionsView.as_view()),
    path("me/progress/", ProgressView.as_view()),
    path("provider/providers/<uuid:provider_id>/consumption-credential/", ProviderCredentialView.as_view()),
]
