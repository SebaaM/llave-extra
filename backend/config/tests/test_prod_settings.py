import os
import subprocess
import sys


def test_production_requires_explicit_allowed_hosts():
    env = os.environ.copy()
    env.pop("DJANGO_ALLOWED_HOSTS", None)
    env["DJANGO_SECRET_KEY"] = "a" * 60
    result = subprocess.run(
        [sys.executable, "-c", "import config.settings.prod"],
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )
    assert result.returncode != 0
    assert "DJANGO_ALLOWED_HOSTS es obligatorio en producción" in result.stderr
