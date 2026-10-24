import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.db import connection

from .contracts import GatewayError, RemoteOrder, identifier

BASE_URL = "https://api.mercadopago.com/v1/orders"
MAX_RESPONSE = 262144


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def transport(method, url, headers, payload):
    request = Request(url, data=json.dumps(payload, separators=(",", ":")).encode() if payload is not None else None,
                      headers=headers, method=method)
    try:
        with build_opener(NoRedirect).open(request, timeout=10) as response:
            body = response.read(MAX_RESPONSE + 1)
            if len(body) > MAX_RESPONSE:
                raise GatewayError("response_too_large")
            return response.status, body
    except HTTPError as exc:
        # Do not read or log an untrusted error body.
        exc.close()
        return exc.code, b""
    except (TimeoutError, OSError, URLError):
        raise GatewayError("transport_unknown", retry=True) from None


class MercadoPagoGateway:
    def __init__(self, token, *, send=transport):
        self.token = token
        self.send = send

    def request(self, method, suffix="", *, payload=None, key=None, expected=200):
        if connection.in_atomic_block:
            raise RuntimeError("HTTP dentro de transacción prohibido")
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "Accept": "application/json"}
        if key:
            headers["X-Idempotency-Key"] = str(key)
        status, body = self.send(method, BASE_URL + suffix, headers, payload)
        if status != expected:
            raise GatewayError(f"http_{status}" if type(status) is int and 100 <= status <= 599 else "http_unknown",
                               retry=status in (423, 429) or (type(status) is int and 500 <= status <= 599))
        if len(body) > MAX_RESPONSE:
            raise GatewayError("response_too_large")
        try:
            return json.loads(body)
        except (ValueError, UnicodeError):
            raise GatewayError("invalid_json") from None

    def create_order(self, payload, *, idempotency_key):
        return RemoteOrder.parse(self.request("POST", payload=payload, key=idempotency_key, expected=201), creation=True)

    def get_order(self, remote_id):
        return RemoteOrder.parse(self.request("GET", "/" + identifier(remote_id)))

    def refund_order(self, remote_id, *, idempotency_key):
        self.request("POST", "/" + identifier(remote_id) + "/refund", payload={}, key=idempotency_key)
        # POST is an acknowledgement only. The worker always performs GET afterwards.

    def find_order(self, reference, *, begin_date, end_date):
        if end_date <= begin_date or (end_date - begin_date).days > 31:
            raise GatewayError("search_range_review")
        result = self.request("GET", "?" + urlencode({"external_reference": reference,
            "begin_date": begin_date.isoformat(), "end_date": end_date.isoformat(), "limit": 2, "offset": 0}))
        try:
            rows, paging = result["data"], result["paging"]
            total = paging["total"]
            if (type(total) is not int or total not in (0, 1) or not isinstance(rows, list)
                    or len(rows) != total or type(paging["offset"]) is not int or paging["offset"] != 0
                    or type(paging["total_pages"]) is not int or not 0 <= paging["total_pages"] <= 1):
                raise GatewayError("search_ambiguous")
            return self.get_order(identifier(rows[0]["id"])) if total else None
        except (KeyError, TypeError, IndexError):
            raise GatewayError("invalid_search_response") from None
