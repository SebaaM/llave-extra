# Task 8 — Migración de herramientas a uv y pnpm

## Resultado

Migración completada sobre `chore/herramientas-uv-pnpm`, partiendo de `c9ba72689786a5e0999ad71217cc2e2901cbab2d`. `backend/pyproject.toml` y `backend/uv.lock` son la fuente única de dependencias Python; `frontend/package.json`, `frontend/pnpm-lock.yaml` y `frontend/pnpm-workspace.yaml` son la fuente única del frontend. Se retiraron `backend/requirements.txt` y `frontend/package-lock.json`. La instalación nativa deja `backend/.venv`, que Git ignora. Se preservó la copia archivada del lockfile pnpm del usuario: el SHA-256 copiado coincide con el original `39071698F5D4BE7FED044A11697A871D8744B78EA737E4F909C6B84BF851861A`; el workspace lock también coincide (`D6D0C24446D91EF762D37C6BA801BB516E65D7055AA9F8027FCD457409A97CE1`).

Las versiones fijadas son uv 0.11.3, Python 3.13, pnpm 11.22.0 y Node 24.19.0. El contenedor backend usa `python:3.13.16-slim`; en host `uv 0.11.3` resolvió e instaló CPython 3.13.12, el parche 3.13 disponible en su catálogo integrado. `.python-version` se fija al minor `3.13`, no a un parche. El intérprete administrado de uv usado por el host quedó instalado de forma persistente bajo `%LOCALAPPDATA%\uv\python` (CPython 3.13.12); `backend/.venv/pyvenv.cfg` apunta allí, no a `%TEMP%`. Esto respeta `requires-python = ">=3.13,<3.14"` sin obligar a uv dentro de Docker a bajar de la base Python 3.13.16. La imagen Docker 3.13.16 ya había construido correctamente y superado la suite PostgreSQL; no se cambió esa selección. La imagen usa uv exacto 0.11.3 desde `ghcr.io/astral-sh/uv:0.11.3`.

## Instalación y verificación nativa

Se usó `%TEMP%\llaveextra-task8\cache` como `UV_CACHE_DIR` para caché de descargas. `UV_PYTHON_INSTALL_DIR` se fijó a `%LOCALAPPDATA%\uv\python`, una ubicación estable administrada por uv. Se recreó únicamente la venv generada `backend/.venv`; `pyvenv.cfg` confirma su base persistente en `%LOCALAPPDATA%\uv\python\cpython-3.13-windows-x86_64-none`, y `git check-ignore .venv` confirma que la venv del checkout queda ignorada. El host instalado fue Python 3.13.12.

Comandos ejecutados en `backend/`:

- `uv --version` → `uv 0.11.3 (45da18ac3 2026-04-01 x86_64-pc-windows-msvc)`.
- `uv lock --check` → `Resolved 30 packages`; sin cambios de lock.
- `uv sync --locked --all-groups` → `Checked 29 packages`; correcto.
- `uv run --locked python --version` → `Python 3.13.12`.
- `uv run --locked ruff check .` → `All checks passed!`.
- Importación de Django, DRF, spectacular, Pillow, psycopg, qrcode, redis y PyYAML → `imports OK; Django 5.2.18`.
- `git check-ignore .venv` → `.venv`.

En `frontend/` se ejecutó el comando canónico, sin flags ni `store-dir` temporal: `pnpm install --frozen-lockfile` → `Already up to date`, `Done in 210ms using pnpm v11.22.0`. Se ejecutó sobre el `frontend/` real de este checkout y los manifiestos/lockfiles versionados; no se usó una copia alternativa de código ni se modificaron archivos ajenos. El store canónico de pnpm quedó en `%LOCALAPPDATA%\pnpm\store\v11`; `node_modules/.pnpm` es el virtual store local ignorado de `frontend/`. La instalación limpia mostró 241 paquetes hard-linked desde ese store persistente, sin descargas; no hay dependencia de un store temporal ni del `node_modules` previo.

Validaciones frontend ya completadas con el mismo checkout y lockfile: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` y `pnpm audit --audit-level moderate`, todas exitosas. Los tests reportaron 1 prueba proxy, 14 de UI y 2 pruebas puras de Node (17 en total); el build Vite procesó 31 módulos y audit informó `No known vulnerabilities found`.

## Docker, PostgreSQL y CI

La verificación Docker se hizo en el proyecto Compose aislado `llaveextra-task8-uv-pnpm-20261018`, definido por `%TEMP%\llaveextra-task8\compose.validation.yaml`. Sus contextos apuntaron al mismo checkout. Usó PostgreSQL 17.11 y Redis 7.4.2 efímeros en tmpfs, sin reutilizar nombres/proyectos, volúmenes, datos ni `.env` del usuario. Los contenedores y red de ese proyecto se retiraron con `docker compose ... down` sin `-v`; no se alteraron otros proyectos. Los tags quedaron asociados al prefijo propio de validación, no al nombre global histórico de la app.

Con backend `python:3.13.16-slim` y uv 0.11.3:

- `docker compose ... build backend` → exitoso; `uv sync --locked --all-groups` instaló dependencias en `/opt/venv`, fuera del bind mount `/app`.
- `docker compose ... up -d db redis` → PostgreSQL y Redis healthy.
- `python manage.py migrate --noinput` → migraciones completas.
- `python manage.py makemigrations --check --dry-run` → `No changes detected`.
- `pytest -q` → `50 passed in 9.70s` sobre PostgreSQL 17.11 y Redis.
- `docker compose ... build frontend` y `pnpm run build` en la imagen Linux Alpine con Node 24.19.0 y pnpm 11.22.0 → exitosos; se ejecutó el postinstall nativo de esbuild y Vite construyó 31 módulos.

`.github/workflows/ci.yml` instala uv 0.11.3 y ejecuta `uv sync --locked --all-groups`, Ruff, comprobación de migraciones y pruebas. La tarea frontend instala pnpm 11.22.0 antes de configurar Node 24.19.0/cache pnpm; después ejecuta frozen install, lint, tipos, tests, build y audit. En Docker `npm` solo se utiliza como bootstrap para instalar globalmente pnpm 11.22.0; las dependencias del proyecto siempre se instalan desde el lockfile con `pnpm install --frozen-lockfile`.

## Decisiones de producto e interfaz para próximas etapas

La decisión confirmada para F1 es Beneficios como portada principal y Pasaporte en “Mi viaje”. No se implementan F2 ni F3 en Task 8. El roadmap deja F2 para después de E6 y F3 para después de F2. Las próximas etapas deben mantener los cuatro roles (`TOURIST`, `COLLABORATOR`, `PROVIDER`, `ADMIN`), autorización de carpetas del lado servidor y separación entre colaborador y prestador. F1 continúa siendo un prototipo sin integración API. Se alinearon roadmap, README, DEV, AGENTS, contexto, ToDo y documentación del frontend con la elección y la migración.

## Autorrevisión y límites

Se revisaron locks y manifiestos, comandos CI/Docker, exclusiones de `.venv`/`node_modules`, coherencia documental y `git diff --check`. No se añadieron credenciales, `.env`, códigos privados ni cuentas reales. La validación usó servicios efímeros aislados; no se probó el arranque del Compose de uso diario con el `.env` privado del usuario ni se afirma validar integración externa de correo. Las pruebas de dominio se ejecutaron con PostgreSQL, nunca SQLite.
