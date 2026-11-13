import uuid
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic, sleep

import pytest
from django.db import DatabaseError, connection, connections, transaction
from rest_framework.test import APIClient

from accounts.bank import replace_bank_details
from accounts.models import User
from commissions.models import Commission, CommissionCommand, CommissionEvent
from commissions.services import record_referral
from credits.models import Consumption
from credits.services import annul_consumption
from providers.models import Provider, ProviderMembership
from referrals.models import CollaboratorProfile

pytestmark = pytest.mark.django_db
ADMIN = "/api/v1/admin/commissions/"
PROVIDER = "/api/v1/provider/commissions/"
RULES = "/api/v1/admin/commission-rules/"
CBU = "0000000000000000000000"


def client(user):
    result = APIClient()
    result.force_authenticate(user=user)
    return result


@pytest.fixture
def network():
    admin = User.objects.create_superuser("admin@example.test", first_name="Administradora")
    tourist = User.objects.create_user("cliente@example.test", first_name="Nombre privado", email_verified=True)
    collaborator = User.objects.create_user("colabora@example.test", role=User.Role.COLLABORATOR, first_name="Colaboradora")
    profile = CollaboratorProfile.objects.create(user=collaborator, enabled=True)
    provider = Provider.objects.create(name="Prestador uno", slug="prestador-uno")
    owner = User.objects.create_user("prestador@example.test", role=User.Role.PROVIDER, first_name="Dueño")
    ProviderMembership.objects.create(provider=provider, user=owner)
    return admin, tourist, profile, provider, owner


def referred(network, *, tourist=None, provider=None, benefit=True, demo=False, referred=True):
    _, existing_tourist, profile, existing_provider, _ = network
    with transaction.atomic():
        consumption = Consumption.objects.create(
            tourist=tourist or existing_tourist, provider=provider or existing_provider,
            collaborator=profile if referred else None, benefit_id=uuid.uuid4() if benefit else None,
            benefit_title="Beneficio guardado" if benefit else "", benefit_demo=demo, award=0, rule_snapshot={},
        )
        record_referral(consumption)
    return consumption


def detail(api, prefix, case):
    response = api.get(f"{prefix}{case.pk}/")
    assert response.status_code == 200, response.data
    return response.data


def command(api, prefix, case, name, *, key=None, version=None, **data):
    if version is None:
        version = detail(api, prefix, case)["version"]
    return api.post(
        f"{prefix}{case.pk}/actions/{name}/", {"version": version, **data}, format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


def rule(api, rate, *, provider=None, version=None, key=None):
    scope = f"providers/{provider.pk}/" if provider else "global/"
    return api.put(f"{RULES}{scope}", {"rate": rate, "version": version}, format="json",
                   HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))


def prepare(network, case, *, base="100.10", rate="5.00"):
    admin, _, profile, _, owner = network
    a, p = client(admin), client(owner)
    replace_bank_details(profile.user_id, cbu=CBU, alias="dato.bancario")
    assert rule(a, rate).status_code == 200
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount=base).status_code == 200
    assert command(a, ADMIN, case, "approve", amount=base, reason="").status_code == 200
    return a, p


def test_end_to_end_with_banked_change_and_replay(network):
    admin, _, profile, _, owner = network
    a, p = client(admin), client(owner)
    case = referred(network)
    assert detail(a, ADMIN, case)["state"] == "AWAITING_PROVIDER"
    first = detail(p, PROVIDER, case)
    assert "tourist_name" not in first and "bank_configured" not in first
    assert first["events"][0]["actor"] == "Cliente"
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount="100.10").status_code == 200
    assert detail(a, ADMIN, case)["next_step"] == "Configurar porcentaje"

    assert rule(a, "5.00").status_code == 200
    assert command(a, ADMIN, case, "approve", amount="100.10", reason="").status_code == 409
    replace_bank_details(profile.user_id, cbu=CBU, alias="dato.bancario")
    approval = command(a, ADMIN, case, "approve", amount="100.10", reason="")
    assert approval.status_code == 200, approval.data
    assert approval.data == {"id": str(case.pk), "state": "TO_PAY"}
    assert detail(a, ADMIN, case)["approval"]["amount"] == "5.01"
    replace_bank_details(profile.user_id, cbu=CBU, alias="nuevo.alias")
    assert detail(a, ADMIN, case)["bank_changed"]
    assert "nuevo.alias" not in str(detail(a, ADMIN, case))
    reveal_path = f"{ADMIN}{case.pk}/bank-details/"
    reveal = a.post(reveal_path, {"reason": "prepare"}, format="json")
    assert reveal.status_code == 200 and reveal.data == {"cbu": CBU, "alias": "nuevo.alias"}
    assert "no-store" in reveal["Cache-Control"]
    assert p.post(reveal_path, {"reason": "prepare"}, format="json").status_code == 403
    assert "BANK_REVEALED" not in str(detail(p, PROVIDER, case))

    version = detail(p, PROVIDER, case)["version"]
    payment = {"date": "2026-11-10", "reference": "transfer-001", "amount": "5.01"}
    first = command(p, PROVIDER, case, "report-payment", key="payment", version=version, **payment)
    assert first.status_code == 200, first.data
    replay = command(p, PROVIDER, case, "report-payment", key="payment", version=version, **payment)
    assert replay.data == first.data
    assert command(p, PROVIDER, case, "report-payment", key="payment", version=version,
                   **{**payment, "reference": "otra"}).status_code == 409
    assert detail(a, ADMIN, case)["next_step"] == "Verificar pago informado"
    assert command(a, ADMIN, case, "reconcile", receipt_checked=True, receipt_confirmed=False).status_code == 400
    assert command(a, ADMIN, case, "reconcile", receipt_checked=True, receipt_confirmed=True).data["state"] == "COMPLETED"
    event = CommissionEvent.objects.get(commission_id=case.pk, kind="PAYMENT_RECONCILED")
    assert event.actor == admin and event.receipt_checked and event.receipt_confirmed
    assert a.post(reveal_path, {"reason": "verify"}, format="json").status_code == 409
    assert all(CBU not in str(value) and "nuevo.alias" not in str(value)
               for value in CommissionCommand.objects.values_list("response", flat=True))


def test_rule_change_corrected_declaration_and_zero(network):
    admin, _, _, provider, owner = network
    case = referred(network)
    a, p = client(admin), client(owner)
    global_rule = rule(a, "8.00")
    assert global_rule.status_code == 200
    assert rule(a, "100.01", provider=provider).status_code == 400
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount="100.00").status_code == 200
    stale = detail(a, ADMIN, case)["version"]
    overridden = rule(a, "0.00", provider=provider, key="provider-rule")
    assert overridden.status_code == 200
    assert overridden.data == rule(a, "0.00", provider=provider, key="provider-rule").data
    assert rule(a, "1.00", provider=provider, key="provider-rule").status_code == 409
    assert command(a, ADMIN, case, "approve", version=stale, amount="100.00", reason="").status_code == 409
    stale = detail(a, ADMIN, case)["version"]
    assert command(a, ADMIN, case, "request-correction", reason="Revisar el total").status_code == 200
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount="120.00").status_code == 200
    assert command(a, ADMIN, case, "approve", version=stale, amount="120.00", reason="").status_code == 409
    assert command(a, ADMIN, case, "approve", amount="120.00", reason="").data["state"] == "NO_COMMISSION"
    assert rule(a, None, provider=provider, version=overridden.data["version"]).status_code == 200
    current = detail(a, ADMIN, case)
    assert current["approval"]["rate"] == "0.00"
    assert current["current_rate"] == "8.00"
    assert command(a, ADMIN, case, "complete-no-commission", reason="Tasa del 0 %").data["state"] == "COMPLETED"
    assert CommissionEvent.objects.filter(commission_id=case.pk, kind="DECLARED").count() == 2


def test_admin_closes_disputed_benefit_without_commission(network):
    admin, _, _, _, owner = network
    case = referred(network)
    a, p = client(admin), client(owner)
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount="100.00").data["state"] == "TO_PAY"
    result = command(a, ADMIN, case, "complete-no-commission", reason="El beneficio registrado no pudo confirmarse")
    assert result.data["state"] == "COMPLETED"
    dto = detail(a, ADMIN, case)
    assert dto["approval"] is None and dto["payment"] is None
    assert dto["events"][-1]["kind"] == "CLOSED_NO_COMMISSION"
    case.refresh_from_db()
    assert case.state == "VALID" and case.benefit_id is not None


def test_history_demo_filters_and_membership(network):
    admin, tourist, _, provider, owner = network
    case = referred(network)
    historical_user = User.objects.create_user("historico@example.test")
    demo_user = User.objects.create_user("demo@example.test")
    direct_user = User.objects.create_user("directo@example.test")
    historical = referred(network, tourist=historical_user, benefit=False)
    demo = referred(network, tourist=demo_user, demo=True)
    direct = referred(network, tourist=direct_user, benefit=False, referred=False)
    a, p = client(admin), client(owner)
    assert a.get(ADMIN + "?page_size=1").data["count"] == 3
    assert a.get(ADMIN + f"?state=HISTORICAL&provider={provider.pk}").data["results"][0]["id"] == str(historical.pk)
    assert detail(a, ADMIN, demo)["state"] == "DEMO"
    assert a.get(f"{ADMIN}{direct.pk}/").status_code == 404
    assert p.get(PROVIDER).data["count"] == 1
    assert client(tourist).get(PROVIDER).status_code == 403
    staff_only = User.objects.create_user("staff@example.test", role=User.Role.ADMIN, is_staff=True)
    superuser_only = User.objects.create_user("root@example.test", role=User.Role.ADMIN, is_superuser=True)
    assert client(staff_only).get(ADMIN).status_code == 403
    assert client(superuser_only).get(ADMIN).status_code == 403

    version = detail(p, PROVIDER, case)["version"]
    result = command(p, PROVIDER, case, "declare", version=version, key="same", outcome="NOT_CONSUMED", amount=None)
    assert result.data["state"] == "NO_COMMISSION"
    ProviderMembership.objects.filter(user=owner).delete()
    assert p.get(f"{PROVIDER}{case.pk}/").status_code == 404
    assert command(p, PROVIDER, case, "declare", version=version, key="same",
                   outcome="NOT_CONSUMED", amount=None).status_code == 404


def test_discrepancy_incident_and_duplicate_reference(network):
    case = referred(network)
    a, p = prepare(network, case)
    other = referred(network, tourist=User.objects.create_user("segunda@example.test"))
    assert command(p, PROVIDER, other, "declare", outcome="CONSUMED", amount="100.10").status_code == 200
    assert command(a, ADMIN, other, "approve", amount="100.10", reason="").status_code == 200
    payment = {"date": "2026-11-10", "reference": "duplicada", "amount": "4.00"}
    assert command(p, PROVIDER, case, "report-payment", **payment).status_code == 200
    assert command(p, PROVIDER, other, "report-payment", **payment).status_code == 409
    assert command(a, ADMIN, case, "reconcile", receipt_checked=True, receipt_confirmed=True).status_code == 409
    assert command(a, ADMIN, case, "open-incident", reason="Importe en disputa").status_code == 200
    assert detail(a, ADMIN, case)["incident"]
    assert command(a, ADMIN, case, "close-incident", reason="Evidencia verificada").status_code == 200
    assert detail(a, ADMIN, case)["payment"]["reference"] == "duplicada"


def test_annul_then_late_report_preserves_evidence(network):
    admin, _, _, _, _ = network
    case = referred(network)
    a, p = prepare(network, case)
    annul_consumption(case.pk, admin, "Se verificó la anulación")
    assert detail(a, ADMIN, case)["state"] == "ANNULLED"
    payment = command(p, PROVIDER, case, "report-payment", date="2026-11-10", reference="tardía", amount="5.01")
    assert payment.data["state"] == "ANNULLED"
    current = detail(a, ADMIN, case)
    assert current["incident"] and current["payment"]["reference"] == "tardía"
    assert "LATE_PAYMENT_REPORTED" in [event["kind"] for event in current["events"]]


def test_history_is_append_only(network):
    case = referred(network)
    events = CommissionEvent.objects.filter(commission_id=case.pk)
    with pytest.raises(DatabaseError), transaction.atomic():
        events.update(reason="Reescritura")
    assert events.get().reason == ""


@pytest.mark.django_db(transaction=True)
def test_annulment_wins_against_stale_approval_on_the_same_consumption(network):
    admin, _, profile, _, owner = network
    case = referred(network)
    a, p = client(admin), client(owner)
    replace_bank_details(profile.user_id, cbu=CBU, alias="")
    assert rule(a, "5.00").status_code == 200
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount="100.00").status_code == 200
    stale = detail(a, ADMIN, case)["version"]
    worker_pid = Queue()

    def approve():
        try:
            _worker_connection(worker_pid)
            return command(client(admin), ADMIN, case, "approve", version=stale, amount="100.00", reason="")
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            Consumption.objects.select_for_update().get(pk=case.pk)
            future = pool.submit(approve)
            _wait_for_lock(worker_pid.get(timeout=8))
            annul_consumption(case.pk, admin, "Anulación concurrente")
        assert future.result(timeout=10).status_code == 409
    assert Commission.objects.get(pk=case.pk).approval_id is None
    assert detail(a, ADMIN, case)["state"] == "ANNULLED"


@pytest.mark.parametrize("second_rate", ["0.00", "8.00"])
def test_late_payment_can_target_an_earlier_approval(network, second_rate):
    admin, _, _, _, _ = network
    case = referred(network)
    a, p = prepare(network, case)
    first_approval_id = Commission.objects.get(pk=case.pk).approval_id
    assert command(a, ADMIN, case, "reopen", reason="Revisar base").status_code == 200
    assert command(a, ADMIN, case, "request-correction", reason="Revisar declaración").status_code == 200
    current_rule = a.get(RULES).data["global"]
    assert rule(a, second_rate, version=current_rule["version"]).status_code == 200
    assert command(p, PROVIDER, case, "declare", outcome="CONSUMED", amount="100.00").status_code == 200
    assert command(a, ADMIN, case, "approve", amount="100.00", reason="").status_code == 200
    second_approval_id = Commission.objects.get(pk=case.pk).approval_id
    annul_consumption(case.pk, admin, "Anulación posterior a dos aprobaciones")

    options = detail(p, PROVIDER, case)["payment_approvals"]
    expected = [str(first_approval_id)] if second_rate == "0.00" else [str(first_approval_id), str(second_approval_id)]
    assert [item["id"] for item in options] == expected
    payload = {"date": "2026-11-10", "reference": "pago-primera-aprobación", "amount": "5.01"}
    if len(expected) > 1:
        assert command(p, PROVIDER, case, "report-payment", **payload).status_code == 400
    assert command(p, PROVIDER, case, "report-payment", approval_id=str(first_approval_id), **payload).status_code == 200
    commission = Commission.objects.get(pk=case.pk)
    assert commission.approval_id == second_approval_id
    assert commission.payment.basis_id == first_approval_id
    detail_after = detail(a, ADMIN, case)
    assert detail_after["approval"]["amount"] == "5.01"
    assert detail_after["payment"]["approval_id"] == str(first_approval_id)
    remaining = [] if second_rate == "0.00" else [str(second_approval_id)]
    assert [item["id"] for item in detail_after["payment_approvals"]] == remaining
    historical = [event for event in detail_after["events"] if event["kind"] == "APPROVED"]
    assert [event["rate"] for event in historical] == ["5.00", second_rate]
    reported = next(event for event in detail_after["events"] if event["kind"] == "LATE_PAYMENT_REPORTED")
    assert reported["reference"] == payload["reference"]


def test_annul_after_reopening_and_clearing_declaration_keeps_historical_approval(network):
    admin, _, _, _, _ = network
    case = referred(network)
    a, p = prepare(network, case)
    assert command(a, ADMIN, case, "reopen", reason="Revisar aprobación").status_code == 200
    assert command(a, ADMIN, case, "request-correction", reason="Revisar declaración").status_code == 200
    annul_consumption(case.pk, admin, "Sin declaración vigente")
    assert detail(a, ADMIN, case)["declaration"] is None
    assert command(p, PROVIDER, case, "report-payment", date="2026-11-10",
                   reference="pago-previo", amount="5.01").status_code == 200
    commission = Commission.objects.get(pk=case.pk)
    assert commission.approval_id is None
    assert commission.payment.basis.kind == "APPROVED"


def _worker_connection(pid):
    with connection.cursor() as cursor:
        cursor.execute("SET lock_timeout = '12s'")
        cursor.execute("SELECT pg_backend_pid()")
        pid.put(cursor.fetchone()[0])


def _wait_for_lock(pid):
    deadline = monotonic() + 8
    while monotonic() < deadline:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_backend_pid() = ANY(pg_blocking_pids(%s))", [pid])
            if cursor.fetchone()[0]:
                return
        sleep(0.02)
    pytest.fail("El comando no esperó el bloqueo de la transacción concurrente")


@pytest.mark.django_db(transaction=True)
def test_declaration_revalidates_concurrently_revoked_membership(network):
    _, _, _, provider, owner = network
    case = referred(network)
    version = detail(client(owner), PROVIDER, case)["version"]
    worker_pid = Queue()

    def declare():
        try:
            _worker_connection(worker_pid)
            return command(client(owner), PROVIDER, case, "declare", version=version,
                           outcome="CONSUMED", amount="12.00").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=1) as pool:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=owner.pk)
            Provider.objects.select_for_update().get(pk=provider.pk)
            result = pool.submit(declare)
            _wait_for_lock(worker_pid.get(timeout=8))
            ProviderMembership.objects.filter(user=owner).delete()
        assert result.result(timeout=8) == 404
    assert Commission.objects.get(pk=case.pk).declaration_id is None


def test_late_evidence_after_another_approval_was_reconciled(network):
    admin, _, _, _, _ = network
    case = referred(network)
    a, p = prepare(network, case)
    first_approval_id = Commission.objects.get(pk=case.pk).approval_id
    assert command(a, ADMIN, case, "reopen", reason="Actualizar base").status_code == 200
    assert command(a, ADMIN, case, "approve", amount="200.00", reason="Base acordada").status_code == 200
    payment = {"date": "2026-11-10", "reference": "segunda-transferencia", "amount": "10.00"}
    assert command(p, PROVIDER, case, "report-payment", **payment).status_code == 200
    assert command(a, ADMIN, case, "reconcile", receipt_checked=True, receipt_confirmed=True).status_code == 200
    initial_payment_id = Commission.objects.get(pk=case.pk).payment_id
    annul_consumption(case.pk, admin, "Anulación posterior a la conciliación")
    assert command(a, ADMIN, case, "close-incident", reason="Evidencia de la segunda transferencia").status_code == 200
    assert not detail(a, ADMIN, case)["incident"]

    options = detail(p, PROVIDER, case)["payment_approvals"]
    assert [item["id"] for item in options] == [str(first_approval_id)]
    assert command(p, PROVIDER, case, "report-payment", **payment).status_code == 409
    late = {"date": "2026-11-10", "reference": "primera-transferencia", "amount": "5.01"}
    assert command(p, PROVIDER, case, "report-payment", **late).status_code == 200

    commission = Commission.objects.get(pk=case.pk)
    assert commission.payment_id == initial_payment_id
    assert commission.incident
    evidence = commission.events.get(kind="LATE_PAYMENT_REPORTED")
    assert evidence.basis_id == first_approval_id and evidence.reference == late["reference"]
    dto = detail(a, ADMIN, case)
    assert dto["payment"]["reference"] == payment["reference"]
    assert dto["payment_approvals"] == []
    opening = commission.events.filter(kind="INCIDENT_OPENED").latest("id")
    assert opening.basis_id == evidence.pk
    assert command(a, ADMIN, case, "close-incident", reason="Se verificó la evidencia tardía").status_code == 200
    assert commission.events.filter(kind="INCIDENT_CLOSED").latest("id").basis_id == opening.pk
