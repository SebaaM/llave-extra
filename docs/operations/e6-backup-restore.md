# Runbook: respaldo y restauración de E6

Esta guía describe un simulacro local con datos sintéticos. No habilita operaciones productivas ni fija objetivos de recuperación: RPO, RTO, destino y retención requieren aprobación del operador.

## Alcance y límites

- Usar únicamente los proyectos Compose nuevos `llaveextra-e6-src` y `llaveextra-e6-restore`, con sus propios archivos de entorno y volúmenes.
- Usar `compose.e6.lab.yaml` y las imágenes locales fijadas por el laboratorio, siempre con `--pull never`. No ejecutar ni modificar `compose.prod.yaml`; no leer `.env`, `.env.prod`, credenciales reales ni servicios externos.
- La única publicación de host permitida es Nginx en `127.0.0.1:8443`. PostgreSQL, Redis y Django permanecen en redes internas; no abrir puertos adicionales ni realizar llamadas externas. Nginx conserva el bridge estándar de T6 requerido por Docker Desktop para el port mapping y no tiene upstreams externos configurados.
- Mantener todos los archivos de entorno, llaves sintéticas, certificados, tokens de prueba y respaldos bajo `.superpowers/sdd/06-analitica-salida/lab-restore/`, ignorado por Git. No copiar valores secretos al informe, a la consola ni a archivos versionados.
- No ejecutar `down -v`, no borrar volúmenes ni reutilizar proyectos existentes. Si alguno de los nombres o recursos exactos ya existe, detenerse y pedir autorización de alcance antes de cualquier eliminación.

## Checklist previo a ejecutar

Completar y conservar este checklist antes de iniciar contenedores o cambiar datos:

- [x] El commit T6 revisado `351d7bf` está integrado en la rama de trabajo; se leyó `compose.e6.lab.yaml` y no requiere cambios para T7.
- [x] `llaveextra-e6-src` y `llaveextra-e6-restore` no tenían contenedores, redes ni volúmenes previos; no se reutiliza ningún proyecto `llaveextra-e6-security*`.
- [x] Los entornos de origen y destino tienen nombres de proyecto, base, usuario, contraseña y volúmenes distintos; `DJANGO_SECRET_KEY`, `QR_SIGNING_KEY` y `BANK_DETAILS_ENCRYPTION_KEY` son sintéticas y permanecen iguales durante el simulacro. Solo se rota `JWT_SIGNING_KEY` en el destino.
- [x] Los scratch de origen/destino son rutas ignoradas diferentes y solo se montan en contenedores `docker compose run`; el backend persistente no puede leerlos.
- [x] `SHOP_PAYMENT_PROVIDER=disabled`, correo saliente deshabilitado y ningún servicio externo configurado.
- [x] La configuración efectiva publica exclusivamente `127.0.0.1:8443`, no publica PostgreSQL, Redis ni backend, y no configura llamadas ni upstreams externos.
- [x] Todas las imágenes requeridas ya existen localmente; la configuración y cada operación se ejecutan con política de no descargar imágenes.
- [x] El destino se identificó por nombre de proyecto, labels de Compose y nombre real de PostgreSQL; estaba vacío y sin migraciones ni escrituras antes de la restauración.
- [x] El checklist y los controles negativos se escribieron antes de la primera migración, semilla, copia o restauración.

## Preparar los dos laboratorios

1. Crear un estado local nuevo dentro de la ruta ignorada del laboratorio: directorios `source/scratch`, `restore/scratch`, `tls` y `backups`. Si la ruta contiene archivos no reconocidos, no sobrescribirlos; detenerse y solicitar el alcance exacto. Cada `docker compose run` recibe únicamente el scratch de su proyecto con `-v <ruta-ignorada>:/lab-scratch`; nunca escribir credenciales en el bind de código `/app` ni montar scratch en el backend persistente.
2. Generar dos archivos de entorno sintéticos separados. Las credenciales PostgreSQL y los nombres de base son distintos. Se comparten exclusivamente `DJANGO_SECRET_KEY`, `QR_SIGNING_KEY` y `BANK_DETAILS_ENCRYPTION_KEY` sintéticas; el destino comienza con el mismo `JWT_SIGNING_KEY` sintético que el origen para que la rotación posterior sea explícita.
3. Generar una CA y un certificado local con SAN `localhost`. No instalar la CA en el almacén del sistema. Las llamadas HTTPS se validan con `curl.exe --cacert <CA local> --ssl-no-revoke`.
4. Validar cada proyecto por separado con `docker compose --project-name <proyecto> --env-file <env> -f compose.e6.lab.yaml config --quiet`. Rechazar cualquier publicación distinta de `127.0.0.1:8443`.
5. Crear la base de origen con PostgreSQL 17.11, aplicar migraciones una vez y cargar únicamente la fixture sintética descrita en la sección siguiente. Confirmar mediante SQL el proyecto, el nombre real de la base y la versión PostgreSQL antes de continuar.

### Receta PowerShell de identidad y ejecución

Ejecutar desde la raíz del repositorio. Estos comandos no leen `.env` ni muestran los valores de los archivos de entorno:

```powershell
$ErrorActionPreference = 'Stop'
$Lab = (Resolve-Path '.superpowers/sdd/06-analitica-salida/lab-restore').Path
$SourceEnv = Join-Path $Lab 'source/lab.env'
$RestoreEnv = Join-Path $Lab 'restore/lab.env'
$SourceScratch = (Resolve-Path (Join-Path $Lab 'source/scratch')).Path
$RestoreScratch = (Resolve-Path (Join-Path $Lab 'restore/scratch')).Path
$LabTools = (Resolve-Path 'docs/operations/lab').Path
$SourceArgs = @('--project-name', 'llaveextra-e6-src', '--env-file', $SourceEnv, '-f', 'compose.e6.lab.yaml')
$RestoreArgs = @('--project-name', 'llaveextra-e6-restore', '--env-file', $RestoreEnv, '-f', 'compose.e6.lab.yaml')

docker compose @SourceArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_COMPOSE_INVALID' }
docker compose @RestoreArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'T7_RESTORE_COMPOSE_INVALID' }

# Arranque permitido: solo la base de origen.
docker compose @SourceArgs up -d --pull never --wait db
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_DATABASE_START_FAILED' }

# La migración ocurre en un contenedor efímero; el backend persistente no recibe scratch.
docker compose @SourceArgs run --rm --no-deps --pull never backend python manage.py migrate --noinput
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_MIGRATION_FAILED' }

# Únicamente este proceso manual recibe DEBUG/fake y el scratch privado de origen.
docker compose @SourceArgs run --rm --no-deps --pull never `
  -v "${SourceScratch}:/lab-scratch" `
  -e DJANGO_SETTINGS_MODULE=config.settings.local `
  -e SHOP_PAYMENT_PROVIDER=fake `
  backend python manage.py seed_activity_demo --customers 20 --credentials /lab-scratch/activity-demo.local.json
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_SYNTHETIC_SEED_FAILED' }

# No continuar mientras el comando siga ejecutándose. Si el entorno devuelve un ID de sesión,
# consultar ese mismo ID hasta capturar su salida final y código de salida; no inferir término
# desde la creación del contenedor one-off. Luego comprobar checkpoints y cardinalidad:
docker compose @SourceArgs exec -T db psql -U e6_src -d e6_src_db -Atc `
  "SELECT count(*) FILTER (WHERE key='activity-demo:v1:catalog') || '|' || count(*) FILTER (WHERE key LIKE 'activity-demo:v1:store:%') || '|' || count(*) FILTER (WHERE key LIKE 'activity-demo:v1:customer:%') || '|' || count(*) FILTER (WHERE key LIKE 'activity-demo:v1:payment:%') FROM providers_demoseedstate WHERE key LIKE 'activity-demo:v1:%'; SELECT count(*) FROM accounts_user WHERE email LIKE 'activity.cliente.%';"
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_SEED_CHECKPOINT_QUERY_FAILED' }
# Para --customers 20, la primera fila debe ser 1|1|20|20 y la segunda 20.

# Helpers versionados se montan read-only; datos y resultados van al scratch de un solo uso.
docker compose @SourceArgs run --rm --no-deps --pull never `
  -v "${SourceScratch}:/lab-scratch" -v "${LabTools}:/lab-tools:ro" -e PYTHONPATH=/app `
  backend python /lab-tools/e6-fixture-media.py
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_MEDIA_FIXTURE_FAILED' }
docker compose @SourceArgs run --rm --no-deps --pull never `
  -v "${SourceScratch}:/lab-scratch" -v "${LabTools}:/lab-tools:ro" -e PYTHONPATH=/app `
  backend python /lab-tools/e6-snapshot-facts.py --output /lab-scratch/source-before.json
if ($LASTEXITCODE -ne 0) { throw 'T7_SOURCE_SNAPSHOT_FAILED' }
```

Antes de `migrate`, `seed_activity_demo` o fixture, verificar que el contenedor `db` lleva labels `com.docker.compose.project=llaveextra-e6-src` y `com.docker.compose.service=db`, y por SQL que `current_database()` sea `e6_src_db` y PostgreSQL sea 17.11. Para cualquier `docker compose run`, pasar el scratch requerido en esa invocación únicamente; no agregar un bind al servicio persistente.

## Fixture y línea de base

Usar la carga manual `seed_activity_demo --customers 20 --credentials /lab-scratch/activity-demo.local.json` con `DEBUG=True`, PostgreSQL y `SHOP_PAYMENT_PROVIDER=fake` solo para ese proceso. Pasar el scratch ignorado con `docker compose run -v <source/scratch>:/lab-scratch`; ese montaje existe solo para el contenedor de carga. La aplicación del laboratorio continúa usando `config.settings.prod` con pagos deshabilitados; el proveedor falso nunca realiza HTTP externo. No imprimir ni versionar el archivo de accesos.

La carga `seed_demo_media` depende de `legacy_public_id` fijos y no garantiza coincidencia con las ofertas creadas por `seed_activity_demo`; no usarla como fixture de T7. El helper versionado `docs/operations/lab/e6-fixture-media.py` crea el PNG sintético y lo asigna solo a una oferta DEMO publicada ya seleccionada en una carpeta habilitada; valida el acceso del Cliente mediante el flujo normal QR y no cambia configuración de catálogo. El snapshot sanitizado se genera con `docs/operations/lab/e6-snapshot-facts.py`. Ambos archivos se montan read-only desde `docs/operations/lab`; los metadatos y resultados permanecen en el scratch ignorado.

En esta versión, las imágenes de Prestador/Beneficio/Producto usan `PrivateStorage` y el volumen físico `private_media_data`; el carácter público o privado lo decide el endpoint/API. Probar la misma imagen por el catálogo público y por la ruta privada de carpeta, con lectura autorizada y denegación anónima. El código no asigna modelos a `MEDIA_ROOT`; agregar un marcador sintético inerte al volumen `public_media_data` solo para verificar su archivo/tar/hash, y confirmar que Nginx no lo expone. No presentarlo como medio público de producto.

Antes de la copia, iniciar sesión con el Cliente de prueba y conservar access/refresh solo en el estado ignorado. Confirmar que el access y el refresh funcionan, y probar las lecturas de medios previstas. Con los escritores detenidos salvo PostgreSQL/Redis, capturar dos snapshots sanitizados consecutivos con conteos, saldos y totales del libro, pedidos, comisiones, hashes de medios y versión PostgreSQL. Exigir el mismo `domain_fingerprint` y hashes de medios en ambos; si difieren, investigar y no respaldar.

## Capturar el respaldo consistente

1. Detener el backend de origen y confirmar que ningún proceso de aplicación puede escribir. No detener PostgreSQL.
2. Mantener el origen sin escritores mientras se crea un `pg_dump` en formato custom y se archivan los volúmenes `public_media_data` y `private_media_data` del proyecto de origen.
3. Guardar los tres artefactos fuera de Git. Crear un manifiesto que vincule cada archivo con SHA-256, tamaño, nombre del proyecto de origen, nombre real de la base, versión/imagen PostgreSQL y nombres de los dos volúmenes. No incluir claves, tokens, correos ni datos personales.
4. Comprobar las tres sumas y el manifiesto antes de considerar válida la copia. Mantener el escritor detenido hasta que PostgreSQL y ambos medios hayan quedado capturados.
5. Después de completar el manifiesto, reabrir el backend de origen solo para cerrar la sesión sintética mediante el endpoint normal de logout. Verificar que la fila de sesión de origen quedó revocada; el respaldo debe conservar el estado anterior. Volver a detener el backend.

## Controles negativos antes de restaurar

Ejecutar y registrar ambos controles antes de cualquier restauración:

1. **Destino incorrecto:** entregar al preflight el nombre sintético `llaveextra-e6-not-restore`. Debe rechazarlo antes de consultar o crear recursos Docker. Comprobar que no se creó proyecto, volumen, contenedor ni red con ese nombre.
2. **Manifiesto incorrecto:** en una copia de prueba del manifiesto, alterar un SHA-256 o tamaño de artefacto. El preflight debe rechazar la copia antes de ejecutar `pg_restore` o extraer medios. Registrar el inventario SQL del destino vacío antes y después, y demostrar que permanece idéntico. No cambiar el respaldo original ni apuntar el control a una base real.

La puerta de restauración debe validar, en este orden, los nombres exactos de proyecto origen/destino, labels de servicio, identidad y vacío de PostgreSQL destino, pertenencia de los artefactos al manifiesto, y los SHA-256 y tamaños de los tres archivos. Ninguna operación mutante se ejecuta antes de completar todos los controles.

El bloque completo siguiente se ejecuta desde la raíz del repositorio después de capturar los tres artefactos en la ruta ignorada indicada. Realiza el rechazo de proyecto incorrecto, inicia solo el PostgreSQL sintético correcto, rechaza un manifiesto manipulado contra el destino real vacío y, únicamente después de validar identidad, vacío, manifiesto y hashes, ejecuta una sola restauración y extracción. Cualquier discrepancia lanza una excepción antes de la operación correspondiente. No borrar ni reutilizar recursos que ya existan.

```powershell
$ErrorActionPreference = 'Stop'
$Lab = (Resolve-Path '.superpowers/sdd/06-analitica-salida/lab-restore').Path
$BackupRoot = (Resolve-Path (Join-Path $Lab 'backups')).Path
$RestoreEnv = Join-Path $Lab 'restore/lab.env'
$RestoreArgs = @('--project-name', 'llaveextra-e6-restore', '--env-file', $RestoreEnv, '-f', 'compose.e6.lab.yaml')
$ManifestPath = Join-Path $BackupRoot 'manifest.json'
$PublicVolume = 'llaveextra-e6-restore_public_media_data'
$PrivateVolume = 'llaveextra-e6-restore_private_media_data'
if ($PublicVolume -ceq $PrivateVolume) { throw 'T7_MEDIA_VOLUMES_MUST_BE_SEPARATE' }

function Assert-T7ArtifactManifest {
  param([string]$TargetProject, [string]$ManifestPath)
  if ($TargetProject -cne 'llaveextra-e6-restore') { throw 'T7_REJECT=TARGET_PROJECT_IDENTITY' }
  $manifestFull = (Resolve-Path -LiteralPath $ManifestPath).Path
  $prefix = $BackupRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $manifestFull.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'T7_REJECT=MANIFEST_OUTSIDE_BACKUP_ROOT' }
  $m = Get-Content -LiteralPath $manifestFull -Raw | ConvertFrom-Json
  if ($m.schema -cne 'e6-t7-backup/v1' -or $m.source_project -cne 'llaveextra-e6-src' -or
      $m.target_project -cne 'llaveextra-e6-restore' -or $m.source_database -cne 'e6_src_db' -or
      $m.source_postgres_image -cne 'postgres:17.11-alpine' -or $m.source_postgres_version -cne '17.11' -or
      $m.target_database -cne 'e6_restore_db' -or
      $m.source_volumes.public -cne 'llaveextra-e6-src_public_media_data' -or
      $m.source_volumes.private -cne 'llaveextra-e6-src_private_media_data' -or
      $m.target_volumes.public -cne $PublicVolume -or $m.target_volumes.private -cne $PrivateVolume) {
    throw 'T7_REJECT=MANIFEST_IDENTITY'
  }
  $expected = [ordered]@{ postgres_dump = 'postgres.dump'; public_media = 'public-media.tar.gz'; private_media = 'private-media.tar.gz' }
  if (@($m.artifacts.PSObject.Properties).Count -ne $expected.Count) { throw 'T7_REJECT=MANIFEST_ARTIFACT_SET' }
  foreach ($key in $expected.Keys) {
    $artifact = $m.artifacts.$key
    if (-not $artifact -or $artifact.file -cne $expected[$key] -or [IO.Path]::GetFileName($artifact.file) -cne $expected[$key]) {
      throw 'T7_REJECT=MANIFEST_ARTIFACT_NAME'
    }
    if ([string]$artifact.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or [int64]$artifact.bytes -le 0) { throw 'T7_REJECT=MANIFEST_ARTIFACT_METADATA' }
    $artifactPath = Join-Path $BackupRoot $expected[$key]
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) { throw 'T7_REJECT=ARTIFACT_NOT_FOUND' }
    if ([int64]$artifact.bytes -ne [int64](Get-Item -LiteralPath $artifactPath).Length) { throw 'T7_REJECT=ARTIFACT_SIZE' }
    if ((Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne ([string]$artifact.sha256).ToLowerInvariant()) {
      throw 'T7_REJECT=ARTIFACT_SHA256'
    }
  }
  'T7_PREFLIGHT=VALID_ARTIFACTS_3 TARGET=llaveextra-e6-restore'
}

function Get-T7VolumeProof {
  param([string]$VolumeName, [string]$LogicalName)
  $metaLines = docker volume inspect --format '{{.Name}}|{{ index .Labels "com.docker.compose.project" }}|{{ index .Labels "com.docker.compose.volume" }}' $VolumeName
  $result = $LASTEXITCODE
  if ($result -ne 0) { throw 'T7_VOLUME_INSPECT_FAILED' }
  $meta = ($metaLines -join '').Trim()
  $expectedMeta = '{0}|llaveextra-e6-restore|{1}' -f $VolumeName, $LogicalName
  if ($meta -cne $expectedMeta) { throw 'T7_VOLUME_IDENTITY_FAILED' }

  $emptyCode = "from pathlib import Path; p=Path('/lab-check'); print('EMPTY' if not any(p.iterdir()) else 'NOT_EMPTY')"
  $emptyLines = docker compose @RestoreArgs run --rm --no-deps --pull never -v ("{0}:/lab-check:ro" -f $VolumeName) backend python -c $emptyCode
  $result = $LASTEXITCODE
  if ($result -ne 0) { throw 'T7_VOLUME_READ_FAILED' }
  $empty = ($emptyLines -join '').Trim()
  if ($empty -cne 'EMPTY') { throw 'T7_TARGET_MEDIA_VOLUME_NOT_EMPTY' }
  '{0}|{1}' -f $meta, $empty
}

function Get-T7EmptyTargetProof {
  $dbIds = @(docker compose @RestoreArgs ps -q db | Where-Object { $_ })
  $result = $LASTEXITCODE
  if ($result -ne 0 -or $dbIds.Count -ne 1) { throw 'T7_TARGET_DB_CONTAINER_COUNT_FAILED' }
  $dbId = ([string]$dbIds[0]).Trim()
  $labelLines = docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}|{{ index .Config.Labels "com.docker.compose.service" }}' $dbId
  $result = $LASTEXITCODE
  if ($result -ne 0) { throw 'T7_TARGET_DB_LABEL_READ_FAILED' }
  $dbLabels = ($labelLines -join '').Trim()
  if ($dbLabels -cne 'llaveextra-e6-restore|db') { throw 'T7_TARGET_DB_LABEL_MISMATCH' }

  $inventorySql = "WITH user_schemas AS (SELECT oid FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname <> 'pg_toast' AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'), user_objects AS (SELECT count(*) AS n FROM pg_class WHERE relnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_proc WHERE pronamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_type WHERE typnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_operator WHERE oprnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_opclass WHERE opcnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_conversion WHERE connamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_collation WHERE collnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_statistic_ext WHERE stxnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_ts_config WHERE cfgnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_ts_dict WHERE dictnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_ts_parser WHERE prsnamespace IN (SELECT oid FROM user_schemas) UNION ALL SELECT count(*) FROM pg_ts_template WHERE tmplnamespace IN (SELECT oid FROM user_schemas)) SELECT current_database() || '|' || current_user || '|' || current_setting('server_version') || '|' || (SELECT count(*) FROM user_schemas) || '|' || (SELECT sum(n) FROM user_objects)"
  $dbLines = docker compose @RestoreArgs exec -T db psql -X -U e6_restore -d e6_restore_db -At -c $inventorySql
  $result = $LASTEXITCODE
  if ($result -ne 0) { throw 'T7_TARGET_DB_QUERY_FAILED' }
  $dbState = ($dbLines -join '').Trim()
  if ($dbState -cne 'e6_restore_db|e6_restore|17.11|1|0') { throw 'T7_TARGET_DB_IDENTITY_OR_NOT_EMPTY' }

  $publicState = Get-T7VolumeProof -VolumeName $PublicVolume -LogicalName 'public_media_data'
  $privateState = Get-T7VolumeProof -VolumeName $PrivateVolume -LogicalName 'private_media_data'
  'db={0}|{1};public={2};private={3}' -f $dbLabels, $dbState, $publicState, $privateState
}

function Invoke-T7MediaRestore {
  param([string]$VolumeName, [string]$LogicalName, [string]$ArchiveName)
  if ($ArchiveName -notin @('public-media.tar.gz', 'private-media.tar.gz')) { throw 'T7_ARCHIVE_NAME_REJECTED' }
  Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-restore' -ManifestPath $ManifestPath | Out-Null
  $volumeProof = Get-T7VolumeProof -VolumeName $VolumeName -LogicalName $LogicalName
  if (-not $volumeProof.EndsWith('|EMPTY', [StringComparison]::Ordinal)) { throw 'T7_MEDIA_VOLUME_NOT_EMPTY_BEFORE_EXTRACT' }

  $extractCode = @"
import os, tarfile
from pathlib import Path, PurePosixPath
root = Path('/lab-media').resolve()
archive = Path('/lab-backup') / os.environ['T7_MEDIA_ARCHIVE']
bundle = tarfile.open(archive, 'r:gz')
members = bundle.getmembers()
paths = [PurePosixPath(member.name) for member in members]
def safe_member(path, member):
    target = root.joinpath(*path.parts).resolve()
    contained = target == root or root in target.parents
    return bool(path.parts) and not path.is_absolute() and '..' not in path.parts and contained and (member.isdir() or member.isfile())
if any(root.iterdir()):
    raise SystemExit('T7_MEDIA_VOLUME_NOT_EMPTY')
if not members:
    raise SystemExit('T7_TAR_EMPTY')
if len({member.name for member in members}) != len(members) or not all(safe_member(path, member) for path, member in zip(paths, members)):
    raise SystemExit('T7_TAR_MEMBER_REJECTED')
bundle.extractall(root, members=members, filter='data')
print('T7_MEDIA_EXTRACTED')
"@
  docker compose @RestoreArgs run --rm --no-deps --pull never -v ("{0}:/lab-media" -f $VolumeName) -v ("{0}:/lab-backup:ro" -f $BackupRoot) -e ("T7_MEDIA_ARCHIVE={0}" -f $ArchiveName) backend python -c $extractCode
  $result = $LASTEXITCODE
  if ($result -ne 0) { throw 'T7_MEDIA_EXTRACT_FAILED' }
}

# Negativo 1: el helper debe rechazar antes de leer el manifiesto o tocar Docker.
$wrongProjectRejected = $false
try {
  Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-not-restore' -ManifestPath $ManifestPath | Out-Null
  throw 'T7_WRONG_TARGET_WAS_ACCEPTED'
} catch {
  if ($_.Exception.Message -cne 'T7_REJECT=TARGET_PROJECT_IDENTITY') { throw }
  $wrongProjectRejected = $true
}
if (-not $wrongProjectRejected) { throw 'T7_WRONG_TARGET_NEGATIVE_FAILED' }
$wrongProject = 'llaveextra-e6-not-restore'
$wrongContainers = @(docker ps -a --filter "label=com.docker.compose.project=$wrongProject" --format '{{.ID}}')
$result = $LASTEXITCODE
if ($result -ne 0) { throw 'T7_WRONG_PROJECT_CONTAINER_QUERY_FAILED' }
$wrongNetworks = @(docker network ls --filter "label=com.docker.compose.project=$wrongProject" --format '{{.ID}}')
$result = $LASTEXITCODE
if ($result -ne 0) { throw 'T7_WRONG_PROJECT_NETWORK_QUERY_FAILED' }
$wrongVolumes = @(docker volume ls --filter "label=com.docker.compose.project=$wrongProject" --format '{{.Name}}')
$result = $LASTEXITCODE
if ($result -ne 0 -or $wrongContainers.Count -gt 0 -or $wrongNetworks.Count -gt 0 -or $wrongVolumes.Count -gt 0) {
  throw 'T7_WRONG_PROJECT_RESOURCES_EXIST'
}
'CONTROL=WRONG_TARGET_REJECTED_NO_RESOURCES'

# Confirm the correct exact project is fresh before creating only its DB.
$targetContainers = @(docker ps -a --filter 'label=com.docker.compose.project=llaveextra-e6-restore' --format '{{.ID}}')
$result = $LASTEXITCODE
if ($result -ne 0) { throw 'T7_TARGET_CONTAINER_QUERY_FAILED' }
$targetNetworks = @(docker network ls --filter 'label=com.docker.compose.project=llaveextra-e6-restore' --format '{{.ID}}')
$result = $LASTEXITCODE
if ($result -ne 0) { throw 'T7_TARGET_NETWORK_QUERY_FAILED' }
$targetVolumes = @(docker volume ls --filter 'label=com.docker.compose.project=llaveextra-e6-restore' --format '{{.Name}}')
$result = $LASTEXITCODE
if ($result -ne 0 -or $targetContainers.Count -gt 0 -or $targetNetworks.Count -gt 0 -or $targetVolumes.Count -gt 0) {
  throw 'T7_TARGET_PROJECT_ALREADY_EXISTS_STOP'
}
docker compose @RestoreArgs up -d --pull never --wait db
if ($LASTEXITCODE -ne 0) { throw 'T7_TARGET_DATABASE_START_FAILED' }
$before = Get-T7EmptyTargetProof

# Negativo 2: corrupt only an ignored copy of the manifest; require full DB and media readback to match.
$badManifest = Join-Path $BackupRoot 'manifest.bad-sha.json'
if (Test-Path -LiteralPath $badManifest) { throw 'T7_BAD_MANIFEST_COPY_ALREADY_EXISTS_STOP' }
Copy-Item -LiteralPath $ManifestPath -Destination $badManifest
$bad = Get-Content -LiteralPath $badManifest -Raw | ConvertFrom-Json
$bad.artifacts.postgres_dump.sha256 = '0' * 64
$badJson = $bad | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($badManifest, $badJson, [Text.Encoding]::UTF8)
$badChecksumRejected = $false
try {
  Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-restore' -ManifestPath $badManifest | Out-Null
  throw 'T7_BAD_CHECKSUM_WAS_ACCEPTED'
} catch {
  if ($_.Exception.Message -cne 'T7_REJECT=ARTIFACT_SHA256') { throw }
  $badChecksumRejected = $true
}
if (-not $badChecksumRejected) { throw 'T7_BAD_CHECKSUM_NEGATIVE_FAILED' }
$after = Get-T7EmptyTargetProof
if ($after -cne $before) { throw 'T7_NEGATIVE_CONTROL_CHANGED_TARGET' }
'CONTROL=BAD_CHECKSUM_REJECTED_TARGET_UNCHANGED'

# Positive fail-closed path: exact target, empty DB and separate empty media volumes, then real manifest+hashes.
Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-restore' -ManifestPath $ManifestPath
$preRestore = Get-T7EmptyTargetProof
if ($preRestore -cne $before) { throw 'T7_TARGET_CHANGED_BEFORE_RESTORE' }

# One restore only: no --clean and no --create. The target DB is selected by exact Compose project and SQL identity.
Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-restore' -ManifestPath $ManifestPath | Out-Null
docker compose @RestoreArgs run --rm --no-deps --pull never -v ("{0}:/lab-backup:ro" -f $BackupRoot) db sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_restore --no-password --no-owner --no-acl --exit-on-error -h db -U e6_restore -d e6_restore_db /lab-backup/postgres.dump'
if ($LASTEXITCODE -ne 0) { throw 'T7_PG_RESTORE_FAILED_STOP_WITHOUT_RETRY_OR_CLEAN' }

# Revalidate all three artifact hashes and each exact empty target volume immediately before its extraction.
Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-restore' -ManifestPath $ManifestPath | Out-Null
Invoke-T7MediaRestore -VolumeName $PublicVolume -LogicalName 'public_media_data' -ArchiveName 'public-media.tar.gz'
Assert-T7ArtifactManifest -TargetProject 'llaveextra-e6-restore' -ManifestPath $ManifestPath | Out-Null
Invoke-T7MediaRestore -VolumeName $PrivateVolume -LogicalName 'private_media_data' -ArchiveName 'private-media.tar.gz'
Write-Output 'T7_RESTORE_AND_MEDIA_EXTRACT_COMPLETE'
```

La prueba de destino incorrecto falla también si su guard acepta el nombre o si aparecen recursos con esa etiqueta. El control de checksum compara identidad/versión/esquemas/objetos PostgreSQL, labels y contenido vacío de los dos volúmenes antes/después. El camino positivo verifica esos mismos invariantes y los tres hashes antes del dump; vuelve a validar los hashes y cada volumen vacío justo antes de extraer. Si falla una restauración, no repetirla ni limpiar el destino: detenerse y conservar la evidencia.
## Restaurar y recuperar el servicio

1. Levantar únicamente PostgreSQL en `llaveextra-e6-restore`; no iniciar backend, ejecutar migraciones, ni reutilizar Redis del origen. Verificar nombre del proyecto por labels, nombre real de base, versión, vacío y ausencia de tablas de aplicación.
2. Validar nuevamente todo el manifiesto. Restaurar el dump en la base vacía del destino con ownership/permisos del destino, y extraer los archivos públicos y privados en los volúmenes propios del destino. No montar el volumen privado en Nginx.
3. Confirmar integridad de los artefactos, `migrate --check` sin cambios pendientes y misma versión PostgreSQL. Comparar conteos, saldos/libro, pedidos/comisiones y contenido/hash de medios con la línea de base.
4. Antes de iniciar el backend destino, cambiar **solo** `JWT_SIGNING_KEY` por una nueva clave sintética. Comprobar que `QR_SIGNING_KEY` y `BANK_DETAILS_ENCRYPTION_KEY` siguen idénticas al origen, sin mostrar sus valores. Esta rotación no sustituye la política operativa que deberá aprobarse para instalaciones reales.
5. Iniciar Redis destino nuevo y vacío. `AuthSession` vive en PostgreSQL y puede volver a un estado anterior con la copia: Redis vacío por sí solo no revoca esa sesión. Mantener el backend como prueba efímera en la red interna del proyecto; no montar scratch en el servicio persistente.
6. Después de rotar la clave y validar el destino, intentar Nginx destino solo en loopback. Si Docker falla al crear `edge` por agotamiento de pools, no borrar/reutilizar redes ajenas ni cambiar `edge` a `internal`; conservar DB/volúmenes y detenerse. Si `backend` puede arrancar como one-off con `docker compose run --no-deps`, ejecutar `Client(enforce_csrf_checks=True)` de Django bajo `config.settings.prod`, `secure=True`, `HTTP_HOST=localhost:8443`, `Origin/Referer=https://localhost:8443`; ese flujo atraviesa URLconf, middlewares y DRF sobre PostgreSQL restaurado, pero **no es una conexión TLS real ni prueba el port mapping de Nginx**. Si tampoco puede iniciarse esa prueba interna, marcar los puntos pendientes.
7. Con el test client o HTTPS real, comprobar access/refresh viejos con fila `AuthSession` restaurada activa, un login nuevo y `GET /api/v1/auth/me/`; una lectura pública por `/api/v1/catalog/benefits/<id>/media/` (200 + hash esperado), una lectura privada autenticada por `/api/v1/folders/<folder-id>/providers/<provider-id>/benefits/<benefit-id>/media/` (200 + hash esperado) y una lectura privada anónima (401). Para refresh se envían `llave_refresh`, cookie CSRF y `X-CSRFToken` con `Origin`/`Referer` del host sintético. Registrar solo estados, conteos, tamaños y hashes; nunca tokens ni contenido sensible.

## Resultado, límites y parada

Registrar en `docs/verification/18-operacion-e6.md` duración observada, tamaño de los tres artefactos, integridad, versión PostgreSQL, resultados de controles negativos, consultas comparadas, autenticación, medios y errores. Si una comprobación falla, no declarar el simulacro completo ni abrir el servicio restaurado.

La evidencia local no define RPO/RTO, ubicación, cifrado, retención, custodia de llaves, recuperación del SMTP/TLS público, scheduler real ni recuperación de un proveedor de pagos. Si el test client reemplaza a HTTPS real, indicarlo expresamente: solo valida las vistas/middlewares con esquema seguro simulado, no TLS, certificado ni Nginx. No desplegar, publicar ni fusionar como parte de este procedimiento.

La topología local de T6 requiere un bridge estándar para que Docker Desktop conserve el port mapping a loopback. Este ensayo verifica que no hay upstreams ni llamadas externas y que la publicación del host es loopback; no pretende sustituir una política de firewall de egress para despliegues.

Mantener los servicios de ambos proyectos y los respaldos hasta que el orquestador confirme que capturó la evidencia. Después, detener únicamente los dos proyectos T7 identificados, sin `down -v`; conservar los volúmenes y respaldos salvo autorización explícita para eliminarlos.
