import pytest
import redis
from django.conf import settings


@pytest.fixture(autouse=True)
def clear_test_rate_limits():
    # La base Redis 1 es exclusiva de pruebas; evita contaminación entre casos y corridas.
    redis.Redis.from_url(settings.REDIS_URL).flushdb()
