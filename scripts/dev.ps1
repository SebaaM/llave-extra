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
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $secretBytes = New-Object byte[] 48
      $passwordBytes = New-Object byte[] 24
      $rng.GetBytes($secretBytes)
      $rng.GetBytes($passwordBytes)
      $secret = [Convert]::ToBase64String($secretBytes)
      $password = [Convert]::ToBase64String($passwordBytes)
    } finally {
      $rng.Dispose()
    }
    $content = @(
      'DJANGO_SETTINGS_MODULE=config.settings.local'
      "DJANGO_SECRET_KEY=$secret"
      'DJANGO_DEBUG=1'
      'DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend'
      'POSTGRES_DB=llaveextra'
      'POSTGRES_USER=llaveextra'
      "POSTGRES_PASSWORD=$password"
      'POSTGRES_HOST=db'
      'POSTGRES_PORT=5432'
      'MAILPIT_HOST=mailpit'
      'MAILPIT_PORT=1025'
      'VITE_API_BASE_URL=http://localhost:8000/api/v1'
    ) -join "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $root '.env'), "$content`n", $utf8NoBom)
  }
  $envPath = Join-Path $root '.env'
  $existing = [System.IO.File]::ReadAllText($envPath)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $jwtBytes = New-Object byte[] 48
  $qrBytes = New-Object byte[] 48
  try {
    $rng.GetBytes($jwtBytes)
    $rng.GetBytes($qrBytes)
  } finally {
    $rng.Dispose()
  }
  $keys = @{
    JWT_SIGNING_KEY = [Convert]::ToBase64String($jwtBytes)
    QR_SIGNING_KEY = [Convert]::ToBase64String($qrBytes)
    REDIS_URL = 'redis://redis:6379/0'
    PUBLIC_APP_URL = 'http://localhost:5173'
    DEFAULT_FROM_EMAIL = 'no-reply@llaveextra.local'
  }
  foreach ($key in $keys.Keys) {
    if ($existing -notmatch "(?m)^$key=") {
      $existing = $existing.TrimEnd("`r", "`n") + "`n$key=$($keys[$key])`n"
    }
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($envPath, $existing, $utf8NoBom)
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
    docker compose up -d --build db redis
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    docker compose run --rm backend python manage.py migrate
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    docker compose run --rm -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q
  }
  'down' { docker compose down }
}
if ($LASTEXITCODE) { exit $LASTEXITCODE }
