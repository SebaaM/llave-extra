import json
from smtplib import SMTPException
from unittest.mock import Mock

import pytest
from django.core import mail
from rest_framework.exceptions import Throttled
from rest_framework.test import APIClient

URL = "/api/v1/contact/"
PAYLOAD = {"name": "Ana", "email": "ana@example.test", "message": "¿Pueden ayudarme?\nGracias."}


@pytest.fixture(autouse=True)
def clear_test_rate_limits():
    # These HTTP contract tests replace the shared limiter at its service boundary.
    # The limiter's Redis integration is exercised in the authentication suite.
    pass


@pytest.fixture
def submit(settings, monkeypatch):
    settings.CONTACT_RECIPIENT_EMAIL = "inbox@example.test"
    settings.DEFAULT_FROM_EMAIL = "site@example.test"
    limiter = Mock()
    monkeypatch.setattr("accounts.security.rate_limit", limiter)
    client = APIClient(enforce_csrf_checks=True)

    def post(payload=PAYLOAD, **headers):
        return client.post(URL, json.dumps(payload), content_type="application/json", **headers)

    return post, limiter


def test_contact_sends_from_server_and_replies_to_visitor(submit, mailoutbox):
    post, _ = submit
    result = post(HTTP_AUTHORIZATION="Bearer invalid-or-expired")

    assert result.status_code == 204
    assert result.content == b""
    assert "no-store" in result["Cache-Control"]
    assert len(mailoutbox) == 1
    message = mailoutbox[0]
    assert message.from_email == "site@example.test"
    assert message.to == ["inbox@example.test"]
    assert message.reply_to == [PAYLOAD["email"]]
    assert PAYLOAD["name"] in message.body
    assert PAYLOAD["message"] in message.body
    assert message.content_subtype == "plain"


@pytest.mark.parametrize("payload", [
    {},
    [],
    {**PAYLOAD, "name": 123},
    {"name": ["Ana"], "email": "ana@example.test", "message": "Consulta"},
    {**PAYLOAD, "name": "x" * 101},
    {**PAYLOAD, "message": "x" * 3001},
    {**PAYLOAD, "message": "   "},
    {**PAYLOAD, "message": "\ud800"},
    {**PAYLOAD, "email": "bad\nBcc: other@example.test"},
    {**PAYLOAD, "to": "attacker@example.test"},
])
def test_contact_rejects_invalid_and_extra_fields_without_sending(submit, mailoutbox, payload):
    post, _ = submit
    assert post(payload).status_code == 400
    assert not mailoutbox


def test_contact_requires_json_and_limits_request_body(submit, mailoutbox, settings):
    post, _ = submit
    html_post = APIClient(enforce_csrf_checks=True).post(URL, PAYLOAD)
    assert html_post.status_code == 415
    settings.DATA_UPLOAD_MAX_MEMORY_SIZE = 32
    assert post({**PAYLOAD, "message": "x" * 65537}).status_code == 413
    assert not mailoutbox


def test_contact_handles_excessively_nested_json(submit, mailoutbox):
    body = "[" * 1200 + "]" * 1200
    result = APIClient(enforce_csrf_checks=True).post(URL, body, content_type="application/json")
    assert result.status_code == 400
    assert not mailoutbox


def test_contact_quotas_use_trusted_origin_and_fixed_global_identity(submit, mailoutbox):
    post, limiter = submit
    assert post(HTTP_X_LLAVE_CLIENT_IP="192.0.2.1", REMOTE_ADDR="192.0.2.2").status_code == 204
    assert [call.args for call in limiter.call_args_list] == [
        ("contact_origin", "192.0.2.2"),
        ("contact_global", "all"),
    ]
    assert len(mailoutbox) == 1


@pytest.mark.parametrize("limit_call", [0, 1])
def test_contact_returns_429_and_sends_nothing_when_limited(submit, mailoutbox, limit_call):
    post, limiter = submit
    limiter.side_effect = [None] * limit_call + [Throttled(wait=60)]
    response = post()
    assert response.status_code == 429
    assert response["Retry-After"] == "60"
    assert not mailoutbox


@pytest.mark.parametrize("recipient", ["", "invalid addr", "one@example.test,two@example.test"])
def test_contact_returns_generic_503_when_unconfigured(submit, settings, mailoutbox, recipient):
    post, _ = submit
    settings.CONTACT_RECIPIENT_EMAIL = recipient
    assert post().status_code == 503
    assert not mailoutbox


@pytest.mark.parametrize("failure", [SMTPException("private SMTP detail"), TimeoutError("private SMTP detail"), None])
def test_contact_returns_generic_503_when_smtp_does_not_accept(submit, monkeypatch, failure):
    post, _ = submit
    sender = Mock(side_effect=failure, return_value=0)
    monkeypatch.setattr(mail.EmailMessage, "send", sender)

    response = post()
    assert response.status_code == 503
    assert b"private SMTP detail" not in response.content
    assert PAYLOAD["email"].encode() not in response.content
    sender.assert_called_once_with(fail_silently=False)
