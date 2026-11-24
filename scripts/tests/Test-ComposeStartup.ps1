$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $root
try {
  $json = docker compose config --format json
  if ($LASTEXITCODE) { throw 'Compose configuration validation failed.' }
  $config = $json | ConvertFrom-Json
  $command = $config.services.backend.command
  if ($command.Count -ne 3 -or $command[0] -ne 'sh' -or $command[1] -ne '-c' -or
      $command[2] -ne 'python manage.py migrate --noinput && exec python manage.py runserver 0.0.0.0:8000') {
    throw 'The development backend must migrate successfully before starting Django.'
  }
  if ($config.services.backend.depends_on.db.condition -ne 'service_healthy') {
    throw 'The development backend must wait for a healthy database.'
  }
  if (-not $config.services.backend.healthcheck.test) {
    throw 'The backend needs a readiness check for Compose --wait.'
  }
  foreach ($script in @('scripts/dev.ps1', 'scripts/dev.sh')) {
    $source = Get-Content -LiteralPath $script -Raw
    if ($source -notmatch 'docker compose up -d --build --wait' -or
        $source -match 'docker compose exec backend python manage.py migrate') {
      throw "$script must wait for startup migrations without launching a concurrent migration."
    }
  }
  Write-Output 'PASS: Compose migrates before starting Django and waits for PostgreSQL.'
} finally {
  Pop-Location
}
