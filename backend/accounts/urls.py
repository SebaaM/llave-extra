from django.urls import path

from .views import (
    CSRFView,
    ForgotView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterView,
    ResendView,
    ResetView,
    VerifyView,
)

urlpatterns = [
    path("csrf/", CSRFView.as_view()),
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("me/", MeView.as_view()),
    path("refresh/", RefreshView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("verify-email/", VerifyView.as_view()),
    path("resend-verification/", ResendView.as_view()),
    path("forgot-password/", ForgotView.as_view()),
    path("reset-password/", ResetView.as_view()),
]
