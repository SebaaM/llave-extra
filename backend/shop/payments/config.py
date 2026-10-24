from django.conf import settings

from .contracts import GatewayError


def seller_for(provider):
    if provider == "fake":
        if not settings.DEBUG and not getattr(settings, "SHOP_ALLOW_TEST_FAKE", False):
            raise GatewayError("fake_disabled")
        return "DEMO"
    if (provider != "mercadopago" or not settings.SHOP_MP_SANDBOX_VERIFIED
            or not settings.SHOP_MP_ACCESS_TOKEN or not settings.SHOP_MP_SELLER_ID):
        raise GatewayError("gateway_disabled")
    return settings.SHOP_MP_SELLER_ID


def gateway_for(provider):
    if settings.SHOP_PAYMENT_PROVIDER != provider:
        raise GatewayError("gateway_not_selected")
    seller_for(provider)
    if provider == "fake":
        from .fake import FakeGateway
        return FakeGateway()
    from .mercadopago import MercadoPagoGateway
    return MercadoPagoGateway(settings.SHOP_MP_ACCESS_TOKEN)


def http_payload(domain_payload):
    """Pure version-1 translation, including legacy T1 snapshots; never rereads config."""
    return {"type": "online", "processing_mode": "manual", "external_reference": domain_payload["external_reference"],
            "total_amount": domain_payload["total_amount"],
            "items": [{"title": p["title"], "quantity": p["quantity"], "unit_price": p["unit_price"]}
                      for p in domain_payload["items"]]}
