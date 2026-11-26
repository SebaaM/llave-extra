import re
import time
from io import StringIO
from os import environ

from django.conf import settings
from django.core.management import BaseCommand, CommandError, call_command
from django.db import connection
from django.db.models import BigIntegerField, F, Sum, Value
from django.db.models.functions import Coalesce

from commissions.models import Commission
from credits.models import Wallet
from shop.models import Order, PaymentInbox, PaymentOperation

OUTBOX_INTERVAL_SECONDS = 10
MAINTENANCE_INTERVAL_SECONDS = 60
ALLOWED_LAB_DATABASE_NAMES = frozenset({"e6_restore_db", "e6_src_db", "e6security"})
ALLOWED_LAB_DATABASE_HOSTS = frozenset({"db"})


def validate_lab_environment():
    if environ.get("SHOP_SCHEDULER_LAB_ENABLED", "").lower() != "true":
        raise CommandError("El scheduler requiere la opt-in explícita del laboratorio")
    if settings.SHOP_PAYMENT_PROVIDER != "fake":
        raise CommandError("El scheduler requiere SHOP_PAYMENT_PROVIDER=fake")
    test_database = bool(getattr(settings, "SHOP_ALLOW_TEST_FAKE", False))
    if not settings.DEBUG and not test_database:
        raise CommandError("El proveedor fake no está habilitado en este entorno")

    database = connection.settings_dict
    expected_name = environ.get("SHOP_SCHEDULER_LAB_DATABASE_NAME")
    expected_host = environ.get("SHOP_SCHEDULER_LAB_DATABASE_HOST")
    if (
        connection.vendor != "postgresql"
        or not expected_name
        or expected_host is None
        or database["NAME"] != expected_name
        or database["HOST"] != expected_host
        or expected_name not in ALLOWED_LAB_DATABASE_NAMES
        or expected_host not in ALLOWED_LAB_DATABASE_HOSTS
    ):
        raise CommandError("El scheduler requiere la identidad PostgreSQL exacta del laboratorio")


def collect_diagnostics():
    ledger_total = Coalesce(
        Sum("entries__delta"),
        Value(0, output_field=BigIntegerField()),
        output_field=BigIntegerField(),
    )
    ledger_diff = (
        Wallet.objects.annotate(ledger_balance=ledger_total)
        .exclude(balance=F("ledger_balance"))
        .count()
    )
    blocked = PaymentOperation.objects.filter(state=PaymentOperation.State.BLOCKED).count()
    operation_backlog = PaymentOperation.objects.filter(
        state__in=(PaymentOperation.State.PENDING, PaymentOperation.State.RUNNING)
    ).count()
    inbox_backlog = PaymentInbox.objects.filter(done=False).count()
    payment_review = Order.objects.filter(state=Order.State.PAYMENT_REVIEW).count()
    commission_incident = Commission.objects.filter(incident=True).count()
    commission_to_pay = Commission.objects.filter(state="TO_PAY").count()
    attention = blocked + inbox_backlog + payment_review + ledger_diff + commission_incident
    return {
        "blocked": blocked,
        "backlog": operation_backlog + inbox_backlog,
        "payment_review": payment_review,
        "ledger_diff": ledger_diff,
        "commission_incident": commission_incident,
        "commission_to_pay": commission_to_pay,
        "attention": attention,
    }


class Command(BaseCommand):
    help = "Supervisa los workers de tienda únicamente en un laboratorio PostgreSQL aislado."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)
        parser.add_argument("--once", action="store_true", help="Ejecuta un ciclo sin esperar intervalos.")

    def handle(self, *args, **options):
        limit = options["limit"]
        if not 1 <= limit <= 1000:
            raise CommandError("limit debe estar entre 1 y 1000")
        validate_lab_environment()

        try:
            self._run(limit=limit, once=options["once"])
        except KeyboardInterrupt:
            # A later invocation resumes from E5's durable keys and fenced operations.
            self._write_status("heartbeat", 0, time.perf_counter(), "interrupted")

    def _run(self, *, limit, once):
        next_outbox = next_maintenance = time.monotonic()
        while True:
            now = time.monotonic()
            if now >= next_outbox:
                self._run_worker("process_shop_outbox", "outbox", limit)
                next_outbox = time.monotonic() + OUTBOX_INTERVAL_SECONDS

            if now >= next_maintenance:
                self._run_worker("expire_shop_orders", "expire", limit)
                self._run_worker("reconcile_shop_orders", "reconcile", limit)
                self._run_diagnostics()
                next_maintenance = time.monotonic() + MAINTENANCE_INTERVAL_SECONDS

            if once:
                return
            time.sleep(max(0, min(next_outbox, next_maintenance) - time.monotonic()))

    def _run_worker(self, command_name, stage, limit):
        started = time.perf_counter()
        output = StringIO()
        try:
            call_command(command_name, limit=limit, stdout=output, stderr=output)
        except KeyboardInterrupt:
            self._write_status(stage, 0, started, "interrupted")
            raise
        except Exception:
            self._write_status(stage, 0, started, "blocked")
            return

        count = sum(int(value) for value in re.findall(r":\s*(\d+)", output.getvalue()))
        self._write_status(stage, count, started, "ok")

    def _run_diagnostics(self):
        started = time.perf_counter()
        try:
            result = collect_diagnostics()
        except Exception:
            self._write_status("diagnostics", 0, started, "blocked")
            return
        count = sum(result[key] for key in (
            "blocked", "backlog", "payment_review", "ledger_diff", "commission_incident"
        ))
        status = "attention" if result["attention"] else "ok"
        duration = int((time.perf_counter() - started) * 1000)
        self.stdout.write(
            "stage=diagnostics "
            f"count={count} blocked={result['blocked']} backlog={result['backlog']} "
            f"payment_review={result['payment_review']} ledger_diff={result['ledger_diff']} "
            f"commission_incident={result['commission_incident']} "
            f"commission_to_pay={result['commission_to_pay']} duration_ms={duration} result={status}"
        )

    def _write_status(self, stage, count, started, result):
        duration = int((time.perf_counter() - started) * 1000)
        self.stdout.write(f"stage={stage} count={count} duration_ms={duration} result={result}")
