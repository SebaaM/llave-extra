from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", include("config.health_urls")),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/", include("referrals.urls")),
    path("api/v1/", include("providers.urls")),
    path("api/v1/", include("credits.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
