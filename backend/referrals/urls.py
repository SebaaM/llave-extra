from django.urls import path

from .views import FolderListView, QRPNGView, QRView, RedeemView

urlpatterns = [
    path("referrals/redeem/", RedeemView.as_view()),
    path("me/folders/", FolderListView.as_view()),
    path("collaborator/qr/", QRView.as_view()),
    path("collaborator/qr.png", QRPNGView.as_view()),
]
