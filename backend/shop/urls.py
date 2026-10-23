from django.urls import path

from . import views

urlpatterns = [
    path("admin/media/<path:name>", views.ProductAdminMedia.as_view(), name="shop-admin-media"),
    path("products/", views.ProductList.as_view(), name="shop-products"),
    path("products/<uuid:pk>/", views.ProductDetail.as_view(), name="shop-product"),
    path("products/<uuid:pk>/media/", views.ProductMedia.as_view(), name="shop-product-media"),
    path("orders/", views.OrderList.as_view(), name="shop-orders"),
    path("orders/<uuid:pk>/", views.OrderDetail.as_view(), name="shop-order"),
    path("orders/<uuid:pk>/cancel/", views.OrderCancel.as_view(), name="shop-cancel"),
]
