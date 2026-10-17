param(
  [Parameter(Mandatory=$true, Position=0)][ValidateSet('up','test','down')][string]$Action,
  [Parameter(Position=1)][string]$Mode,
  [switch]$Demo
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Initialize-Environment {
  if (-not (Test-Path -LiteralPath '.env')) {
    $secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    @"
DJANGO_SETTINGS_MODULE=config.settings.local
DJANGO_SECRET_KEY=$secret
DJANGO_DEBUG=1
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend
POSTGRES_DB=llaveextra
POSTGRES_USER=llaveextra
POSTGRES_PASSWORD=$password
POSTGRES_HOST=db
POSTGRES_PORT=5432
MAILPIT_HOST=mailpit
MAILPIT_PORT=1025
VITE_API_BASE_URL=http://localhost:8000/api/v1
"@ | Set-Content -LiteralPath '.env' -Encoding utf8
  }
}

switch ($Action) {
  'up' {
    Initialize-Environment
    docker compose up -d --build
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    docker compose exec backend python manage.py migrate
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    if ($Demo -or $Mode -eq '--demo') { docker compose exec backend python manage.py seed_demo }
  }
  'test' {
    Initialize-Environment
    docker compose build backend
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    docker compose up -d --build db
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    docker compose run --rm backend python manage.py migrate
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    docker compose run --rm -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q
  }
  'down' { docker compose down }
}
if ($LASTEXITCODE) { exit $LASTEXITCODE }
