# Laboratorio local de auditoría

Ejecutar desde el worktree de auditoría. El proyecto `llaveextra-security` tiene red, servicios y volúmenes propios. El proxy queda en `127.0.0.1:8082`, el backend directo en `8002`, Vite en `5175` y Mailpit en `8027`. PostgreSQL y Redis quedan en la red de Compose. Los puertos deben estar libres antes de iniciar.

## Preparación en PowerShell 7

```powershell
$ErrorActionPreference = 'Stop'
$null = New-Item -ItemType Directory -Force work/security
$source = Get-Content -Raw compose.yaml
$effective = $source.Replace('build: ./backend', 'build: ../../backend').Replace('build: ./frontend', 'build: ../../frontend').Replace('env_file: .env', 'env_file: audit.env')
$effective = $effective.Replace('      DEMO_CREDENTIALS_PATH: /workspace/docs/cuentas-prueba.local.md','      DEMO_CREDENTIALS_PATH: /tmp/security-demo-accounts.md')
$effective = $effective -replace '(?m)^\s*- \./docs:/workspace/docs\r?\n',''
$effective = $effective.Replace('- ./','- ../../').Replace('"./deploy/nginx/dev.conf:', '"../../deploy/nginx/dev.conf:')
$effective = $effective.Replace('127.0.0.1:8000:8000','127.0.0.1:8002:8000').Replace('127.0.0.1:5173:5173','127.0.0.1:5175:5173').Replace('127.0.0.1:8080:80','127.0.0.1:8082:80').Replace('127.0.0.1:8025:8025','127.0.0.1:8027:8025')
$effective | Set-Content -Encoding utf8 work/security/compose.audit.yaml
if (-not (Test-Path work/security/audit.env)) {
  $lines = @('DJANGO_SETTINGS_MODULE=config.settings.local','POSTGRES_DB=llaveextra_security','POSTGRES_USER=llaveextra_security','DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost,backend,nginx,testserver','PUBLIC_APP_URL=http://127.0.0.1:8082','REDIS_URL=redis://redis:6379/0','SHOP_PAYMENT_PROVIDER=disabled')
  foreach ($name in 'DJANGO_SECRET_KEY','JWT_SIGNING_KEY','QR_SIGNING_KEY','POSTGRES_PASSWORD') {
    $lines += "$name=$([Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant())"
  }
  $lines | Set-Content -Encoding utf8 work/security/audit.env
}
$lab = @('--env-file','work/security/audit.env','-f','work/security/compose.audit.yaml','-p','llaveextra-security')
git check-ignore work/security/audit.env work/security/compose.audit.yaml
docker compose @lab config --services
docker compose @lab up -d --build
docker compose @lab exec -T backend python manage.py migrate --noinput
```

La receta toma imágenes y locks del corte. El backend usa el hasher normal y SMTP local para QA HTTP. La suite usa una base PostgreSQL de pytest y el namespace de pruebas de Redis dentro del mismo proyecto. Ejecutar suites de backend en serie para mantener el aislamiento de Redis. Los fixtures de ataque usan direcciones `.test` y contraseñas generadas para la corrida. En los reportes se usan alias. Los valores de configuración efectiva, cookies, QR y enlaces de Mailpit se quedan en el laboratorio.

```powershell
docker compose @lab exec -T backend python -m pytest --ds=config.settings.test -q
docker compose @lab exec -T backend ruff check .
docker compose @lab exec -T backend python manage.py makemigrations --check --dry-run
docker compose @lab exec -T backend python manage.py spectacular --validate --fail-on-warn --file /tmp/security-openapi.yaml
docker compose @lab exec -T frontend pnpm run lint
docker compose @lab exec -T frontend pnpm run typecheck
docker compose @lab exec -T frontend pnpm run test
docker compose @lab exec -T frontend pnpm run build
```

El alcance HTTP se limita a los puertos de laboratorio, con hasta dos solicitudes por segundo, dos conexiones y 30 segundos por solicitud. Las ráfagas de concurrencia y cuota documentadas por caso se limitan a ocho workers y 60 segundos. El simulador de pagos solo se habilita explícitamente en pruebas. Los comandos de QA apuntan siempre a la configuración efectiva de este proyecto.
