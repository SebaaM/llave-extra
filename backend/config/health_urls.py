from django.urls import path

from .health import health

urlpatterns = [path("", health, name="health")]
