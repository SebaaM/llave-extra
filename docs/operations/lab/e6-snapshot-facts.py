import argparse
import hashlib
import json
from pathlib import Path

import django
from django.conf import settings
from django.db import connection
from django.db.models import Count, Sum

django.setup()

from accounts.models import AuthSession  # noqa: E402
from commissions.models import Commission, CommissionEvent  # noqa: E402
from credits.models import Consumption, Wallet, WalletEntry  # noqa: E402
from providers.models import Benefit, FolderBenefit, Provider  # noqa: E402
from referrals.models import FolderAccess  # noqa: E402
from shop.models import Order, OrderAudit, OrderLine, Product  # noqa: E402


def grouped_counts(queryset, *fields):
    return list(queryset.values(*fields).annotate(total=Count("pk")).order_by(*fields))


def queryset_digest(queryset):
    digest = hashlib.sha256()
    for row in queryset.iterator():
        payload = json.dumps(row, default=str, separators=(",", ":"), ensure_ascii=True)
        digest.update(payload.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def media_tree(root: Path):
    files = []
    if root.exists():
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(root).as_posix()
            hasher = hashlib.sha256()
            size = 0
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    size += len(block)
                    hasher.update(block)
            files.append({"path": relative, "bytes": size, "sha256": hasher.hexdigest()})
    return {"file_count": len(files), "total_bytes": sum(item["bytes"] for item in files), "files": files}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    output = Path(parser.parse_args().output)
    if output.parent != Path("/lab-scratch") or output.exists():
        raise SystemExit("T7_SNAPSHOT_OUTPUT_PATH_INVALID_OR_EXISTS")
    if connection.vendor != "postgresql":
        raise SystemExit("T7_SNAPSHOT_REQUIRES_POSTGRESQL")

    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database(), current_setting('server_version')")
        database_name, postgres_version = cursor.fetchone()

    wallet_sum = Wallet.objects.aggregate(total=Sum("balance"))["total"] or 0
    entry_sum = WalletEntry.objects.aggregate(total=Sum("delta"))["total"] or 0
    order_sums = Order.objects.aggregate(money=Sum("total_money"), credits=Sum("total_credits"))
    commission_sums = CommissionEvent.objects.aggregate(amount=Sum("amount"), base=Sum("base_amount"))
    records = {
        "wallets": Wallet.objects.count(),
        "wallet_entries": WalletEntry.objects.count(),
        "consumptions": Consumption.objects.count(),
        "orders": Order.objects.count(),
        "order_lines": OrderLine.objects.count(),
        "order_audits": OrderAudit.objects.count(),
        "commissions": Commission.objects.count(),
        "commission_events": CommissionEvent.objects.count(),
        "auth_sessions": AuthSession.objects.count(),
        "active_auth_sessions": AuthSession.objects.filter(revoked_at__isnull=True).count(),
        "revoked_auth_sessions": AuthSession.objects.filter(revoked_at__isnull=False).count(),
        "folder_accesses": FolderAccess.objects.count(),
        "folder_benefit_selections": FolderBenefit.objects.count(),
        "providers": Provider.objects.count(),
        "benefits": Benefit.objects.count(),
        "products": Product.objects.count(),
    }
    aggregates = {
        "wallet_balance_sum": wallet_sum,
        "wallet_entry_delta_sum": entry_sum,
        "wallet_ledger_reconciles": wallet_sum == entry_sum,
        "consumptions_by_state": grouped_counts(Consumption.objects, "state"),
        "orders_by_mode_and_state": grouped_counts(Order.objects, "mode", "state"),
        "order_money_total": order_sums["money"],
        "order_credits_total": order_sums["credits"],
        "commission_states": grouped_counts(Commission.objects, "state"),
        "commission_event_kinds": grouped_counts(CommissionEvent.objects, "kind"),
        "commission_event_amount_sum": commission_sums["amount"],
        "commission_event_base_sum": commission_sums["base"],
    }
    fingerprints = {
        "wallets": queryset_digest(
            Wallet.objects.order_by("tourist_id").values_list("tourist_id", "balance", "redemptions_frozen")
        ),
        "wallet_entries": queryset_digest(
            WalletEntry.objects.order_by("pk").values_list(
                "pk", "wallet_id", "kind", "delta", "source_entry_id", "created_at"
            )
        ),
        "consumptions": queryset_digest(
            Consumption.objects.order_by("pk").values_list(
                "pk", "tourist_id", "provider_id", "collaborator_id", "benefit_id", "award", "state", "created_at"
            )
        ),
        "orders": queryset_digest(
            Order.objects.order_by("pk").values_list(
                "pk", "customer_id", "mode", "state", "total_money", "total_credits", "created_at",
                "stock_released", "payment_confirmed",
            )
        ),
        "order_lines": queryset_digest(
            OrderLine.objects.order_by("pk").values_list(
                "pk", "order_id", "product_id", "quantity", "unit_money", "unit_credits"
            )
        ),
        "order_audits": queryset_digest(
            OrderAudit.objects.order_by("pk").values_list("pk", "order_id", "actor_id", "action", "created_at")
        ),
        "commissions": queryset_digest(
            Commission.objects.order_by("pk").values_list(
                "pk", "state", "incident", "verified_rate", "verified_source", "declaration_id", "approval_id",
                "payment_id", "last_event_id",
            )
        ),
        "commission_events": queryset_digest(
            CommissionEvent.objects.order_by("pk").values_list(
                "pk", "commission_id", "actor_id", "kind", "created_at", "outcome", "currency", "amount",
                "base_amount", "rate", "rule_source", "receipt_checked", "receipt_confirmed",
            )
        ),
    }
    facts = {
        "database": {"name": database_name, "postgres_version": postgres_version},
        "records": records,
        "aggregates": aggregates,
        "fingerprints": fingerprints,
        "media": {
            "public_volume": media_tree(Path(settings.MEDIA_ROOT)),
            "private_volume": media_tree(Path(settings.PRIVATE_MEDIA_ROOT)),
        },
    }
    canonical = json.dumps(facts | {"database": {}}, sort_keys=True, default=str, separators=(",", ":"))
    facts["domain_fingerprint"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    output.write_text(json.dumps(facts, sort_keys=True, indent=2, default=str), encoding="utf-8")
    print("T7 snapshot written; output excludes names, emails, references, credentials, tokens, and bank data.")


if __name__ == "__main__":
    main()
