import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol
from urllib.parse import urlsplit

REMOTE_ID = re.compile(r"[A-Za-z0-9_-]{1,100}\Z")
AMOUNT = re.compile(r"(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,2})?\Z")


class GatewayError(Exception):
    """Only locally chosen codes, never remote response text or credentials."""

    def __init__(self, code, *, retry=False):
        self.code = code
        self.retry = retry
        super().__init__(code)


def identifier(value):
    if not isinstance(value, str) or not REMOTE_ID.fullmatch(value):
        raise GatewayError("invalid_remote_id")
    return value


def amount(value):
    if not isinstance(value, str) or not AMOUNT.fullmatch(value):
        raise GatewayError("invalid_amount")
    return Decimal(value)


def checkout_url(value):
    if not isinstance(value, str) or len(value) > 1000:
        raise GatewayError("invalid_checkout_url")
    parts = urlsplit(value)
    if (parts.scheme != "https" or parts.hostname not in
            {"www.mercadopago.com.ar", "mercadopago.com.ar", "sandbox.mercadopago.com.ar"}
            or parts.username or parts.password or parts.port not in (None, 443)
            or any(ord(c) < 33 for c in value)):
        raise GatewayError("invalid_checkout_url")
    return value


@dataclass(frozen=True)
class RemoteOrder:
    id: str
    external_reference: str
    seller: str
    currency: str
    country: str
    total: Decimal
    status: str
    detail: str
    paid: Decimal | None
    payments: tuple[dict, ...]
    refunds: tuple[dict, ...]
    checkout_url: str = ""

    @classmethod
    def parse(cls, data, *, creation=False):
        try:
            if not isinstance(data, dict):
                raise ValueError
            payments = data.get("transactions", {}).get("payments", [])
            refunds = data.get("transactions", {}).get("refunds", [])
            if (not isinstance(payments, list) or not isinstance(refunds, list)
                    or len(payments) > 100 or len(refunds) > 100
                    or not all(isinstance(x, dict) for x in payments + refunds)):
                raise ValueError
            seller = data["user_id"]
            if type(seller) not in (int, str) or not str(seller) or len(str(seller)) > 100:
                raise ValueError
            reference = data["external_reference"]
            if not isinstance(reference, str) or len(reference) > 100:
                raise ValueError
            for field in ("currency", "country_code", "status", "status_detail"):
                if not isinstance(data[field], str) or not 1 <= len(data[field]) <= 80:
                    raise ValueError
            url = checkout_url(data["checkout_url"]) if creation or data.get("checkout_url") else ""
            return cls(identifier(data["id"]), reference, str(seller), data["currency"],
                       data["country_code"], amount(data["total_amount"]), data["status"],
                       data["status_detail"], amount(data["total_paid_amount"]) if not creation else None,
                       tuple(payments), tuple(refunds), url)
        except (KeyError, TypeError, ValueError, AttributeError):
            raise GatewayError("invalid_response") from None


class Gateway(Protocol):
    def create_order(self, payload: dict, *, idempotency_key: str) -> RemoteOrder: ...
    def get_order(self, remote_id: str) -> RemoteOrder: ...
    def refund_order(self, remote_id: str, *, idempotency_key: str) -> None: ...
    def find_order(self, reference: str, *, begin_date, end_date) -> RemoteOrder | None: ...
