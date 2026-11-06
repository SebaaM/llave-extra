# Rutas resueltas por Django y contrato OpenAPI

Inventario del resolver. Para Django Admin, los métodos se rigen por vistas y permisos de modelo; su ausencia de OpenAPI es deliberada.

| Ruta Django | Método(s) de la vista | OpenAPI | Módulo / vista |
| --- | --- | --- | --- |
| `/admin/` | Django Admin | — | `django.contrib.admin.sites.index` |
| `/admin/login/` | Django Admin | — | `django.contrib.admin.sites.login` |
| `/admin/logout/` | Django Admin | — | `django.contrib.admin.sites.logout` |
| `/admin/password_change/` | Django Admin | — | `django.contrib.admin.sites.password_change` |
| `/admin/password_change/done/` | Django Admin | — | `django.contrib.admin.sites.password_change_done` |
| `/admin/autocomplete/` | Django Admin | — | `django.contrib.admin.sites.autocomplete_view` |
| `/admin/jsi18n/` | Django Admin | — | `django.contrib.admin.sites.i18n_javascript` |
| `/admin/r/<path:content_type_id>/<path:object_id>/` | Django Admin | — | `django.contrib.contenttypes.views.shortcut` |
| `/admin/auth/group/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/auth/group/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/auth/group/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/auth/group/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/auth/group/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/auth/group/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/accounts/user/<id>/password/` | Django Admin | — | `django.contrib.auth.admin.user_change_password` |
| `/admin/accounts/user/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/accounts/user/add/` | Django Admin | — | `django.contrib.auth.admin.add_view` |
| `/admin/accounts/user/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/accounts/user/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/accounts/user/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/accounts/user/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/referrals/collaboratorprofile/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/referrals/collaboratorprofile/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/referrals/collaboratorprofile/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/referrals/collaboratorprofile/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/referrals/collaboratorprofile/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/referrals/collaboratorprofile/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/referrals/folderaccess/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/referrals/folderaccess/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/referrals/folderaccess/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/referrals/folderaccess/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/referrals/folderaccess/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/referrals/folderaccess/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/providers/catalogconfig/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/providers/catalogconfig/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/providers/catalogconfig/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/providers/catalogconfig/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/providers/catalogconfig/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/providers/catalogconfig/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/providers/provider/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/providers/provider/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/providers/provider/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/providers/provider/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/providers/provider/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/providers/provider/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/providers/providermembership/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/providers/providermembership/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/providers/providermembership/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/providers/providermembership/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/providers/providermembership/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/providers/providermembership/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/providers/folderprovider/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/providers/folderprovider/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/providers/folderprovider/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/providers/folderprovider/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/providers/folderprovider/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/providers/folderprovider/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/providers/folderbenefit/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/providers/folderbenefit/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/providers/folderbenefit/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/providers/folderbenefit/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/providers/folderbenefit/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/providers/folderbenefit/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/providers/benefit/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/providers/benefit/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/providers/benefit/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/providers/benefit/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/providers/benefit/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/providers/benefit/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/creditpolicy/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/creditpolicy/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/creditpolicy/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/creditpolicy/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/creditpolicy/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/creditpolicy/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/providercreditrule/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/providercreditrule/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/providercreditrule/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/providercreditrule/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/providercreditrule/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/providercreditrule/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/providerconsumptioncredential/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/providerconsumptioncredential/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/providerconsumptioncredential/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/providerconsumptioncredential/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/providerconsumptioncredential/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/providerconsumptioncredential/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/consumption/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/consumption/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/consumption/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/consumption/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/consumption/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/consumption/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/adjustmentcase/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/adjustmentcase/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/adjustmentcase/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/adjustmentcase/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/adjustmentcase/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/adjustmentcase/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/wallet/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/wallet/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/wallet/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/wallet/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/wallet/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/wallet/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/walletentry/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/walletentry/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/walletentry/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/walletentry/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/walletentry/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/walletentry/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/credits/consumptionidempotency/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/credits/consumptionidempotency/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/credits/consumptionidempotency/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/credits/consumptionidempotency/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/credits/consumptionidempotency/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/credits/consumptionidempotency/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/product/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/product/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/product/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/product/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/product/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/product/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/productcategory/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/productcategory/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/productcategory/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/productcategory/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/productcategory/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/productcategory/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/shopsettings/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/shopsettings/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/shopsettings/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/shopsettings/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/shopsettings/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/shopsettings/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/order/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/order/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/order/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/order/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/order/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/order/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/cancellationrequest/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/cancellationrequest/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/cancellationrequest/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/cancellationrequest/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/cancellationrequest/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/cancellationrequest/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/paymentoperation/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/paymentoperation/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/paymentoperation/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/paymentoperation/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/paymentoperation/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/paymentoperation/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/orderline/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/orderline/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/orderline/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/orderline/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/orderline/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/orderline/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/checkoutkey/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/checkoutkey/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/checkoutkey/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/checkoutkey/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/checkoutkey/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/checkoutkey/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/stockadjustment/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/stockadjustment/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/stockadjustment/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/stockadjustment/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/stockadjustment/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/stockadjustment/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/orderaudit/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/orderaudit/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/orderaudit/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/orderaudit/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/orderaudit/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/orderaudit/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/paymentcontext/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/paymentcontext/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/paymentcontext/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/paymentcontext/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/paymentcontext/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/paymentcontext/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/paymentinbox/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/paymentinbox/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/paymentinbox/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/paymentinbox/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/paymentinbox/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/paymentinbox/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/shop/fakeremoteorder/` | Django Admin | — | `django.contrib.admin.options.changelist_view` |
| `/admin/shop/fakeremoteorder/add/` | Django Admin | — | `django.contrib.admin.options.add_view` |
| `/admin/shop/fakeremoteorder/<path:object_id>/history/` | Django Admin | — | `django.contrib.admin.options.history_view` |
| `/admin/shop/fakeremoteorder/<path:object_id>/delete/` | Django Admin | — | `django.contrib.admin.options.delete_view` |
| `/admin/shop/fakeremoteorder/<path:object_id>/change/` | Django Admin | — | `django.contrib.admin.options.change_view` |
| `/admin/shop/fakeremoteorder/<path:object_id>/` | Django Admin | — | `django.views.generic.base.RedirectView` |
| `/admin/^(?P<app_label>auth|accounts|referrals|providers|credits|shop)/$` | Django Admin | — | `django.contrib.admin.sites.app_index` |
| `/admin/(?P<url>.*)$` | Django Admin | — | `django.contrib.admin.sites.catch_all_view` |
| `/api/v1/health/` | GET | — | `config.health.health` |
| `/api/v1/auth/csrf/` | GET, HEAD, OPTIONS | GET | `accounts.views.CSRFView` |
| `/api/v1/auth/register/` | OPTIONS, POST | POST | `accounts.views.RegisterView` |
| `/api/v1/auth/login/` | OPTIONS, POST | POST | `accounts.views.LoginView` |
| `/api/v1/auth/me/` | GET, HEAD, OPTIONS | GET | `accounts.views.MeView` |
| `/api/v1/auth/refresh/` | OPTIONS, POST | POST | `accounts.views.RefreshView` |
| `/api/v1/auth/logout/` | OPTIONS, POST | POST | `accounts.views.LogoutView` |
| `/api/v1/auth/verify-email/` | OPTIONS, POST | POST | `accounts.views.VerifyView` |
| `/api/v1/auth/resend-verification/` | OPTIONS, POST | POST | `accounts.views.ResendView` |
| `/api/v1/auth/forgot-password/` | OPTIONS, POST | POST | `accounts.views.ForgotView` |
| `/api/v1/auth/reset-password/` | OPTIONS, POST | POST | `accounts.views.ResetView` |
| `/api/v1/referrals/redeem/` | OPTIONS, POST | POST | `referrals.views.RedeemView` |
| `/api/v1/me/folders/` | GET, HEAD, OPTIONS | GET | `referrals.views.FolderListView` |
| `/api/v1/collaborator/qr/` | GET, HEAD, OPTIONS | GET | `referrals.views.QRView` |
| `/api/v1/collaborator/qr/renew/` | OPTIONS, POST | POST | `referrals.views.QRRenewalView` |
| `/api/v1/collaborator/qr.png` | GET, HEAD, OPTIONS | GET | `referrals.views.QRPNGView` |
| `/api/v1/collaborator/catalog/benefits/` | GET, HEAD, OPTIONS | GET | `providers.recommendations.CollaboratorCatalogView` |
| `/api/v1/collaborator/recommendations/` | GET, HEAD, OPTIONS | GET | `providers.recommendations.CollaboratorRecommendationsView` |
| `/api/v1/collaborator/recommendations/<uuid:benefit_id>/` | DELETE, OPTIONS, PUT | PUT, DELETE | `providers.recommendations.CollaboratorRecommendationView` |
| `/api/v1/collaborator/recommendations/<uuid:benefit_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.recommendations.CollaboratorRecommendationMediaView` |
| `/api/v1/catalog/config/` | GET, HEAD, OPTIONS | GET | `providers.catalog_views.CatalogConfigView` |
| `/api/v1/catalog/categories/` | GET, HEAD, OPTIONS | GET | `providers.catalog_views.CatalogCategoriesView` |
| `/api/v1/catalog/network/` | GET, HEAD, OPTIONS | GET | `providers.network.NetworkView` |
| `/api/v1/catalog/benefits/` | GET, HEAD, OPTIONS | GET | `providers.catalog_views.CatalogBenefitsView` |
| `/api/v1/catalog/benefits/<uuid:benefit_id>/` | GET, HEAD, OPTIONS | GET | `providers.catalog_views.CatalogBenefitView` |
| `/api/v1/catalog/benefits/<uuid:benefit_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.catalog_views.CatalogBenefitMediaView` |
| `/api/v1/catalog/providers/<uuid:provider_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.catalog_views.CatalogProviderMediaView` |
| `/api/v1/admin/private-media/<path:name>` | Sin restricción explícita de método | — | `providers.views.admin_private_media` |
| `/api/v1/folders/<uuid:folder_id>/providers/` | GET, HEAD, OPTIONS | GET | `providers.views.FolderProvidersView` |
| `/api/v1/folders/<uuid:folder_id>/benefits/` | GET, HEAD, OPTIONS | GET | `providers.folder_selection.FolderSelectionView` |
| `/api/v1/folders/<uuid:folder_id>/network/` | GET, HEAD, OPTIONS | GET | `providers.network.FolderNetworkView` |
| `/api/v1/folders/<uuid:folder_id>/providers/<uuid:provider_id>/` | GET, HEAD, OPTIONS | GET | `providers.views.FolderProviderView` |
| `/api/v1/folders/<uuid:folder_id>/providers/<uuid:provider_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.views.FolderProviderMediaView` |
| `/api/v1/folders/<uuid:folder_id>/providers/<uuid:provider_id>/benefits/` | GET, HEAD, OPTIONS | GET | `providers.views.FolderBenefitsView` |
| `/api/v1/folders/<uuid:folder_id>/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/` | GET, HEAD, OPTIONS | GET | `providers.views.FolderBenefitView` |
| `/api/v1/folders/<uuid:folder_id>/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.views.FolderBenefitMediaView` |
| `/api/v1/provider/providers/` | GET, HEAD, OPTIONS | GET | `providers.views.OwnProvidersView` |
| `/api/v1/provider/providers/<uuid:provider_id>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `providers.views.OwnProviderView` |
| `/api/v1/provider/providers/<uuid:provider_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.views.OwnProviderMediaView` |
| `/api/v1/provider/providers/<uuid:provider_id>/benefits/` | GET, HEAD, OPTIONS, POST | GET, POST | `providers.views.OwnBenefitsView` |
| `/api/v1/provider/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/` | DELETE, GET, HEAD, OPTIONS, PATCH | GET, PATCH, DELETE | `providers.views.OwnBenefitView` |
| `/api/v1/provider/providers/<uuid:provider_id>/benefits/<uuid:benefit_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.views.OwnBenefitMediaView` |
| `/api/v1/collaborator/folder/` | GET, HEAD, OPTIONS | GET | `providers.views.CollaboratorFolderView` |
| `/api/v1/collaborator/folder/providers/<uuid:provider_id>/media/` | GET, HEAD, OPTIONS | GET | `providers.views.CollaboratorProviderMediaView` |
| `/api/v1/provider/providers/<uuid:provider_id>/consumption-credential/qr.png` | GET, HEAD, OPTIONS | GET | `credits.views.ProviderCredentialPNGView` |
| `/api/v1/consumptions/` | OPTIONS, POST | POST | `credits.views.ConsumptionView` |
| `/api/v1/me/wallet/` | GET, HEAD, OPTIONS | GET | `credits.views.WalletView` |
| `/api/v1/me/consumptions/` | GET, HEAD, OPTIONS | GET | `credits.views.MyConsumptionsView` |
| `/api/v1/me/progress/` | GET, HEAD, OPTIONS | GET | `credits.views.ProgressView` |
| `/api/v1/provider/providers/<uuid:provider_id>/consumption-credential/` | GET, HEAD, OPTIONS, PUT | GET, PUT | `credits.views.ProviderCredentialView` |
| `/api/v1/shop/payments/webhook/` | OPTIONS, POST | POST | `shop.payments.webhooks.OrderWebhook` |
| `/api/v1/shop/admin/media/<path:name>` | GET, HEAD, OPTIONS | — | `shop.views.ProductAdminMedia` |
| `/api/v1/shop/products/` | GET, HEAD, OPTIONS | GET | `shop.views.ProductList` |
| `/api/v1/shop/catalog/` | GET, HEAD, OPTIONS | GET | `shop.views.PublicCatalog` |
| `/api/v1/shop/products/<uuid:pk>/` | GET, HEAD, OPTIONS | GET | `shop.views.ProductDetail` |
| `/api/v1/shop/products/<uuid:pk>/media/` | GET, HEAD, OPTIONS | GET | `shop.views.ProductMedia` |
| `/api/v1/shop/orders/` | GET, HEAD, OPTIONS, POST | GET, POST | `shop.views.OrderList` |
| `/api/v1/shop/orders/<uuid:pk>/` | GET, HEAD, OPTIONS | GET | `shop.views.OrderDetail` |
| `/api/v1/shop/orders/<uuid:pk>/cancel/` | OPTIONS, POST | POST | `shop.views.OrderCancel` |
| `/api/v1/site-settings/` | GET, HEAD, OPTIONS | GET | `administration.views.PublicSiteSettingsView` |
| `/api/v1/admin/settings/general/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.views.GeneralSettingsView` |
| `/api/v1/admin/settings/catalog/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.views.CatalogSettingsView` |
| `/api/v1/admin/settings/credits/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.views.CreditSettingsView` |
| `/api/v1/admin/settings/shop/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.views.ShopSettingsView` |
| `/api/v1/admin/activity/` | GET, HEAD, OPTIONS | GET | `administration.views.ActivityView` |
| `/api/v1/admin/dashboard/` | GET, HEAD, OPTIONS | GET | `administration.dashboard.DashboardView` |
| `/api/v1/admin/users/<int:pk>/invite/` | OPTIONS, POST | POST | `administration.invitations.InviteView` |
| `/api/v1/admin/collaborators/<uuid:pk>/recommendations/` | GET, HEAD, OPTIONS | GET | `administration.recommendations.AdminRecommendationsView` |
| `/api/v1/admin/collaborators/<uuid:pk>/summary/` | GET, HEAD, OPTIONS | GET | `administration.summary.CollaboratorSummaryView` |
| `/api/v1/admin/<str:resource>/<uuid:pk>/image/` | GET, HEAD, OPTIONS | GET | `administration.media.AdminImageView` |
| `/api/v1/admin/<str:resource>/<uuid:pk>/qr/` | GET, HEAD, OPTIONS | GET | `administration.media.AdminQRView` |
| `/api/v1/admin/<str:resource>/<uuid:pk>/qr.png` | GET, HEAD, OPTIONS | GET | `administration.media.AdminQRPNGView` |
| `/api/v1/admin/users/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.UsersViewCollection` |
| `/api/v1/admin/users/<int:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.UsersViewDetail` |
| `/api/v1/admin/providers/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.ProvidersViewCollection` |
| `/api/v1/admin/providers/<uuid:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.ProvidersViewDetail` |
| `/api/v1/admin/benefits/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.BenefitsViewCollection` |
| `/api/v1/admin/benefits/<uuid:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.BenefitsViewDetail` |
| `/api/v1/admin/collaborators/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.CollaboratorsViewCollection` |
| `/api/v1/admin/collaborators/<uuid:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.CollaboratorsViewDetail` |
| `/api/v1/admin/consumptions/` | GET, HEAD, OPTIONS | GET | `administration.resources.ConsumptionsViewCollection` |
| `/api/v1/admin/consumptions/<uuid:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.ConsumptionsViewDetail` |
| `/api/v1/admin/wallets/` | GET, HEAD, OPTIONS | GET | `administration.resources.WalletsViewCollection` |
| `/api/v1/admin/wallets/<int:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.WalletsViewDetail` |
| `/api/v1/admin/adjustments/` | GET, HEAD, OPTIONS | GET | `administration.resources.AdjustmentsViewCollection` |
| `/api/v1/admin/adjustments/<int:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.AdjustmentsViewDetail` |
| `/api/v1/admin/products/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.ProductsViewCollection` |
| `/api/v1/admin/product-categories/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.ProductCategoriesViewCollection` |
| `/api/v1/admin/product-categories/<uuid:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.ProductCategoriesViewDetail` |
| `/api/v1/admin/products/<uuid:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.ProductsViewDetail` |
| `/api/v1/admin/orders/` | GET, HEAD, OPTIONS | GET | `administration.resources.OrdersViewCollection` |
| `/api/v1/admin/orders/<uuid:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.OrdersViewDetail` |
| `/api/v1/admin/cancellations/` | GET, HEAD, OPTIONS | GET | `administration.resources.CancellationsViewCollection` |
| `/api/v1/admin/cancellations/<int:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.CancellationsViewDetail` |
| `/api/v1/admin/credit-rules/` | GET, HEAD, OPTIONS, POST | GET, POST | `administration.resources.CreditRulesViewCollection` |
| `/api/v1/admin/credit-rules/<int:pk>/` | GET, HEAD, OPTIONS, PATCH | GET, PATCH | `administration.resources.CreditRulesViewDetail` |
| `/api/v1/admin/stock-adjustments/` | GET, HEAD, OPTIONS | GET | `administration.resources.StockAdjustmentsViewCollection` |
| `/api/v1/admin/stock-adjustments/<int:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.StockAdjustmentsViewDetail` |
| `/api/v1/admin/payment-operations/` | GET, HEAD, OPTIONS | GET | `administration.resources.PaymentOperationsViewCollection` |
| `/api/v1/admin/payment-operations/<uuid:pk>/` | GET, HEAD, OPTIONS | GET | `administration.resources.PaymentOperationsViewDetail` |
| `/api/v1/admin/providers/<uuid:pk>/actions/assign-user/` | OPTIONS, POST | POST | `administration.operations.AdminProvidersAssignUserAction` |
| `/api/v1/admin/providers/<uuid:pk>/actions/unassign-user/` | OPTIONS, POST | POST | `administration.operations.AdminProvidersUnassignUserAction` |
| `/api/v1/admin/providers/<uuid:pk>/actions/set-pin/` | OPTIONS, POST | POST | `administration.operations.AdminProvidersSetPinAction` |
| `/api/v1/admin/providers/<uuid:pk>/actions/rotate-qr/` | OPTIONS, POST | POST | `administration.operations.AdminProvidersRotateQrAction` |
| `/api/v1/admin/collaborators/<uuid:pk>/actions/enable/` | OPTIONS, POST | POST | `administration.operations.AdminCollaboratorsEnableAction` |
| `/api/v1/admin/collaborators/<uuid:pk>/actions/disable/` | OPTIONS, POST | POST | `administration.operations.AdminCollaboratorsDisableAction` |
| `/api/v1/admin/collaborators/<uuid:pk>/actions/rotate-qr/` | OPTIONS, POST | POST | `administration.operations.AdminCollaboratorsRotateQrAction` |
| `/api/v1/admin/collaborators/<uuid:pk>/actions/add-benefit/` | OPTIONS, POST | POST | `administration.operations.AdminCollaboratorsAddBenefitAction` |
| `/api/v1/admin/collaborators/<uuid:pk>/actions/remove-benefit/` | OPTIONS, POST | POST | `administration.operations.AdminCollaboratorsRemoveBenefitAction` |
| `/api/v1/admin/consumptions/<uuid:pk>/actions/annul/` | OPTIONS, POST | POST | `administration.operations.AdminConsumptionsAnnulAction` |
| `/api/v1/admin/adjustments/<int:pk>/actions/resolve/` | OPTIONS, POST | POST | `administration.operations.AdminAdjustmentsResolveAction` |
| `/api/v1/admin/products/<uuid:pk>/actions/adjust-stock/` | OPTIONS, POST | POST | `administration.operations.AdminProductsAdjustStockAction` |
| `/api/v1/admin/orders/<uuid:pk>/actions/prepare/` | OPTIONS, POST | POST | `administration.operations.AdminOrdersPrepareAction` |
| `/api/v1/admin/orders/<uuid:pk>/actions/deliver/` | OPTIONS, POST | POST | `administration.operations.AdminOrdersDeliverAction` |
| `/api/v1/admin/orders/<uuid:pk>/actions/refund/` | OPTIONS, POST | POST | `administration.operations.AdminOrdersRefundAction` |
| `/api/v1/admin/cancellations/<int:pk>/actions/approve/` | OPTIONS, POST | POST | `administration.operations.AdminCancellationsApproveAction` |
| `/api/v1/admin/cancellations/<int:pk>/actions/reject/` | OPTIONS, POST | POST | `administration.operations.AdminCancellationsRejectAction` |
| `/api/v1/admin/payment-operations/<uuid:pk>/actions/retry/` | OPTIONS, POST | POST | `administration.operations.AdminPaymentOperationsRetryAction` |
| `/api/v1/admin/credit-rules/<int:pk>/actions/remove/` | OPTIONS, POST | POST | `administration.operations.AdminCreditRulesRemoveAction` |
| `/api/schema/` | GET, HEAD, OPTIONS | GET | `drf_spectacular.views.SpectacularAPIView` |
| `/api/docs/` | GET, HEAD, OPTIONS | — | `drf_spectacular.views.SpectacularSwaggerView` |
