from django.core.management.base import BaseCommand, CommandError

from shop.payments.processing import process_outbox
from shop.payments.webhooks import process_inbox


class Command(BaseCommand):
    help = "Procesa un lote acotado del inbox y outbox de pagos; no imprime datos sensibles."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = options["limit"]
        if not 1 <= limit <= 1000:
            raise CommandError("limit debe estar entre 1 y 1000")
        inbox = process_inbox(limit=limit)
        outbox = process_outbox(limit=limit)
        self.stdout.write(f"Notificaciones procesadas: {inbox}; operaciones procesadas: {outbox}")
