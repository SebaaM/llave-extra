# Llave Extra

Red de beneficios turísticos de Ushuaia. El catálogo general de beneficios publicados y vigentes es público cuando el administrador lo habilita. Los **prestadores** ofrecen beneficios; los **colaboradores** refieren turistas a una carpeta privada de recomendaciones mediante un QR único habilitado por el administrador.

## Desarrollo por etapas

El [plan de implementación](docs/plans/00-roadmap.md) define entregables, verificaciones y dependencias. El [contexto](CONTEXT.md) conserva las decisiones funcionales y [AGENTS.md](AGENTS.md) las reglas de trabajo.

El flujo de ramas vigente está en [GitFlow](docs/gitflow.md): `main` estable, `develop` para integración y ramas `feature/*`, `release/*` y `hotfix/*`. La corrección del catálogo público se desarrolla en `feature/catalogo-publico-admin` con PR hacia `develop`; no se fusionan PRs automáticamente.

## Inicio local

Requisitos: Git y Docker con Compose. Desde PowerShell, ejecutá `./scripts/dev.ps1 up -Demo`; desde macOS/Linux, `./scripts/dev.sh up --demo`. El primer arranque crea `.env` con secretos locales y valores de desarrollo, construye los contenedores y aplica migraciones. El archivo `.env` está ignorado por Git.

Aplicación demo: <http://localhost:5173>. Backoffice Django: <http://localhost:5173/admin/>. API y OpenAPI: <http://localhost:8000/api/v1/health/> y <http://localhost:8000/api/schema/>. Documentación interactiva: <http://localhost:8000/api/docs/>. Mailpit: <http://localhost:8025>. [Contrato de API](docs/api.md), [modelo](docs/data-model.md) y [reglas](docs/business-rules.md).

En desarrollo, Vite reenvía `/admin/`, los archivos `/static/admin/` y la API a Django. Las imágenes privadas del backoffice usan `/api/v1/admin/private-media/`, con autorización de Django. El backoffice solicita su propio inicio de sesión con cookie de sesión y token CSRF; ingresar en la aplicación con JWT no inicia automáticamente esa sesión. `/media/` se reenvía a Django, pero los archivos privados no se publican allí.

Las contraseñas generadas de las seis cuentas demo se guardan en `docs/cuentas-prueba.local.md`, un archivo local ignorado por Git. El seed es idempotente y conserva contraseñas y datos de usuarios existentes. Para parar sin borrar datos: `./scripts/dev.ps1 down` o `./scripts/dev.sh down`. Para pruebas: `./scripts/dev.ps1 test` o `./scripts/dev.sh test`.

## Roles

- `ADMIN`: administra usuarios, carpetas, colaboradores, QR y reglas.
- `PROVIDER`: prestador/negocio; es distinto del colaborador.
- `COLLABORATOR`: refiere turistas a prestadores de su carpeta asignada.
- `TOURIST`: consulta el catálogo general y sus recomendaciones privadas tras obtener acceso por QR autorizado.

E2 entrega API de registro, ingreso, verificación y recuperación por correo local, QR de colaborador y acceso privado. E3 agrega prestadores, beneficios y carpetas con filtros de servidor. E4 implementa consumos y créditos. El producto usa la portada Beneficios y Mi viaje estilo Pasaporte; `/beneficios` muestra catálogo público, `/recomendaciones` la carpeta privada por QR y `/consumo` permite validación directa o referida. Los prototipos F1 se retiraron. El administrador habilita perfiles, rota QR y controla el catálogo en `/admin/`. Para añadir fotos aprobadas a registros demo ya existentes sin alterar otros datos, ejecutar `docker compose exec backend uv run --locked python manage.py seed_demo_media` con `DEBUG` local; ver [fuentes y licencias](docs/assets.md). Tienda y analítica siguen pendientes. Mailpit valida solo SMTP local, no entregabilidad externa.

La herramienta de backend es uv 0.11.3 (Python 3.13.16) y la del frontend pnpm 11.22.0 (Node 24.19.0). Docker Compose sigue siendo el arranque predeterminado y no necesita uv, Python ni Node instalados en el host. La opción de uv para IDE y ejecución nativa, con sus requisitos de PostgreSQL/Redis/SMTP, está en [DEV.md](DEV.md).
