#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

bootstrap() {
  if [ ! -f .env ]; then
    if ! command -v openssl >/dev/null 2>&1; then
      echo "Se necesita OpenSSL (incluido normalmente con Git) para crear secretos locales." >&2
      exit 1
    fi
    secret="$(openssl rand -hex 48)"
    dbpass="$(openssl rand -hex 24)"
    cat > .env <<EOF
DJANGO_SETTINGS_MODULE=config.settings.local
DJANGO_SECRET_KEY=$secret
DJANGO_DEBUG=1
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend
POSTGRES_DB=llaveextra
POSTGRES_USER=llaveextra
POSTGRES_PASSWORD=$dbpass
POSTGRES_HOST=db
POSTGRES_PORT=5432
MAILPIT_HOST=mailpit
MAILPIT_PORT=1025
VITE_API_BASE_URL=http://localhost:8000/api/v1
EOF
    chmod 600 .env 2>/dev/null || true
  fi
  for key in JWT_SIGNING_KEY QR_SIGNING_KEY; do
    if ! grep -q "^${key}=" .env; then
      printf '%s=%s\n' "$key" "$(openssl rand -hex 48)" >> .env
    fi
  done
  if ! grep -q '^REDIS_URL=' .env; then printf '%s\n' 'REDIS_URL=redis://redis:6379/0' >> .env; fi
  if ! grep -q '^PUBLIC_APP_URL=' .env; then printf '%s\n' 'PUBLIC_APP_URL=http://localhost:5173' >> .env; fi
  if ! grep -q '^DEFAULT_FROM_EMAIL=' .env; then printf '%s\n' 'DEFAULT_FROM_EMAIL=no-reply@llaveextra.local' >> .env; fi
}

case "${1:-}" in
  up)
    bootstrap
    docker compose up -d --build
    docker compose exec backend python manage.py migrate
    if [ "${2:-}" = "--demo" ] || [ "${2:-}" = "-Demo" ]; then docker compose exec backend python manage.py seed_demo; fi
    ;;
  test)
    bootstrap
    docker compose build backend
    docker compose up -d --build db redis
    docker compose run --rm backend python manage.py migrate
    docker compose run --rm -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q
    ;;
  down) docker compose down ;;
  *) echo "Uso: scripts/dev.sh {up [--demo]|test|down}" >&2; exit 2 ;;
esac
