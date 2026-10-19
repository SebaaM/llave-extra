# Task 5 — contrato seguro de la red visual

Implementé la configuración de red general en `CatalogConfig` y la configuración independiente por colaborador en `CollaboratorProfile`. La migración agrega títulos y presets con choices cerradas, más restricciones PostgreSQL para tamaño de página (10–15) e intervalo (8–60). Los valores iniciales son `Red Llave Extra` para la red general y `Recomendaciones` para cada carpeta; el resto usa `RADIAL`, `SAND`, `HARBOR`, 12 y 10 segundos.

Agregué `GET /api/v1/catalog/network/?page=1` y `GET /api/v1/folders/<folder_id>/network/?page=1`. La lista agrupa prestadores únicos con beneficio publicado/vigente, ordena por nombre/UUID y selecciona una oferta estable por título/UUID. La configuración determina el tamaño de página; se rechazan parámetros distintos de `page`. La red pública usa el DTO público y respeta el interruptor del catálogo. La red de carpeta usa `folder_profile`, vuelve a comprobar `active_folder_access` en cada página y genera los medios con `ProviderReadSerializer` y contexto de carpeta.

El Admin en español permite editar los seis parámetros de red para el catálogo general y cada perfil de colaborador, manteniendo bajo control administrativo los campos de habilitación y QR existentes. No cambié reglas de consumo, créditos, asignaciones, QR ni finanzas.

## Verificación

Entorno: Docker Compose con proyecto PostgreSQL/Redis aislado `llaveextra-acceptance8`.

- `docker compose -p llaveextra-acceptance8 run --rm --no-deps backend uv run --locked pytest providers/tests/test_network.py -q` — **3 passed**.
- `docker compose -p llaveextra-acceptance8 run --rm --no-deps backend uv run --locked pytest providers/tests referrals/tests -q` — **26 passed**.
- `docker compose -p llaveextra-acceptance8 run --rm --no-deps backend uv run --locked ruff check providers referrals` — **All checks passed**.
- `docker compose -p llaveextra-acceptance8 run --rm --no-deps backend uv run --locked python manage.py makemigrations --check --dry-run` — **No changes detected**.
- `docker compose -p llaveextra-acceptance8 run --rm --no-deps backend uv run --locked python manage.py spectacular --file /tmp/task5-openapi.yaml --validate` — **exit 0, sin warnings**.
- `git diff --check` — **sin errores**.

## Cambios documentales

Actualicé `docs/api.md`, `CONTEXT.md`, `ToDo.md` y marqué implementadas las partes de Task 5 en `docs/plans/07-catalogo-publico-gitflow.md`. Conservé en el mismo commit los cambios documentales previos de la spec y el plan que forman parte de esta entrega.

Commit Task 5: pendiente.
