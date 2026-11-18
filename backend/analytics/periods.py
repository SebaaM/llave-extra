import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ANALYTICS_TIMEZONE_NAME = "America/Argentina/Ushuaia"
ANALYTICS_TIMEZONE = ZoneInfo(ANALYTICS_TIMEZONE_NAME)
DEFAULT_PERIOD_DAYS = 30
MAX_PERIOD_DAYS = 366
BUSINESSES_PAGE_SIZE = 25
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_POSITIVE_INTEGER = re.compile(r"^[0-9]+$")


@dataclass(frozen=True)
class AnalyticsPeriod:
    start: date
    end: date

    def as_dict(self):
        return {
            "from": self.start.isoformat(),
            "to": self.end.isoformat(),
            "timezone": ANALYTICS_TIMEZONE_NAME,
        }

    def datetime_filters(self, field="created_at"):
        start_at = datetime.combine(self.start, time.min, tzinfo=ANALYTICS_TIMEZONE)
        filters = {f"{field}__gte": start_at}
        if self.end < date.max:
            end_exclusive = datetime.combine(self.end + timedelta(days=1), time.min, tzinfo=ANALYTICS_TIMEZONE)
            filters[f"{field}__lt"] = end_exclusive
        else:
            filters[f"{field}__lte"] = datetime.combine(self.end, time.max, tzinfo=ANALYTICS_TIMEZONE)
        return filters


def _single_value(query_params, name):
    if hasattr(query_params, "getlist"):
        values = query_params.getlist(name)
    elif name in query_params:
        values = [query_params[name]]
    else:
        values = []
    if len(values) > 1:
        raise ValueError(f"El parámetro {name} debe aparecer una sola vez.")
    return values[0] if values else None


def _parse_date(value, name):
    if not isinstance(value, str) or not _ISO_DATE.fullmatch(value):
        raise ValueError(f"El parámetro {name} debe usar el formato AAAA-MM-DD.")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"El parámetro {name} no contiene una fecha válida.") from exc


def parse_period(query_params, *, today=None):
    """Parse an inclusive civil-date range in the configured analytics timezone."""
    start_value = _single_value(query_params, "from")
    end_value = _single_value(query_params, "to")
    if start_value is None and end_value is None:
        local_today = today or datetime.now(ANALYTICS_TIMEZONE).date()
        if isinstance(local_today, datetime):
            local_today = local_today.astimezone(ANALYTICS_TIMEZONE).date()
        return AnalyticsPeriod(start=local_today - timedelta(days=DEFAULT_PERIOD_DAYS - 1), end=local_today)
    if start_value is None or end_value is None:
        raise ValueError("Los parámetros from y to deben enviarse juntos.")

    start = _parse_date(start_value, "from")
    end = _parse_date(end_value, "to")
    if start > end:
        raise ValueError("El inicio del período no puede ser posterior al final.")
    if (end - start).days + 1 > MAX_PERIOD_DAYS:
        raise ValueError(f"El período no puede superar {MAX_PERIOD_DAYS} días inclusivos.")
    return AnalyticsPeriod(start=start, end=end)


def parse_collaborator_id(query_params):
    value = _single_value(query_params, "collaborator_id")
    if value is None:
        return None
    try:
        return uuid.UUID(value)
    except (AttributeError, ValueError) as exc:
        raise ValueError("El parámetro collaborator_id debe ser un UUID válido.") from exc


def parse_page(query_params):
    value = _single_value(query_params, "page")
    if value is None:
        return 1
    if not isinstance(value, str) or not _POSITIVE_INTEGER.fullmatch(value):
        raise ValueError("El parámetro page debe ser un entero positivo.")
    page = int(value)
    if page < 1:
        raise ValueError("El parámetro page debe ser un entero positivo.")
    return page
