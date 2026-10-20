# Instrucciones del proyecto

## Fuente de verdad

Leer `CONTEXT.md` y la etapa correspondiente de `docs/plans/00-roadmap.md` antes de implementar. La corrección más reciente del usuario sobre colaboradores/prestadores prevalece sobre el informe histórico.

## Restricciones

- Django + DRF, PostgreSQL, React + TypeScript + Tailwind; Docker local.
- Usuario por email antes de la primera migración. No usar SQLite para validar código del dominio o pruebas de integración.
- Carpetas y referencias privadas: autorización del servidor por QR válido, colaborador habilitado y prestador perteneciente a esa carpeta. Ocultar enlaces en React no satisface este requisito.
- Prestador y colaborador son roles diferentes. Solo un administrador asigna carpetas, habilita colaboradores y configura las reglas de créditos.
- Existen exactamente cuatro roles: Cliente (`TOURIST`, identificador técnico compatible), Colaborador (`COLLABORATOR`), Prestador (`PROVIDER`) y Administrador (`ADMIN`). El Cliente es la experiencia principal; el registro público crea solo `TOURIST` sin privilegios.
- Consumos, créditos y stock requieren transacciones, restricciones de base de datos e idempotencia.
- No versionar credenciales, `.env`, códigos privados ni cuentas reales. `.env-example` contiene valores vacíos.
- Mantener `ToDo.md`, contexto, instrucciones y contrato OpenAPI alineados con cada funcionalidad.
- Catálogo general público de beneficios publicados/vigentes, configurable por administrador; carpetas y referencias siguen privadas. Ver `docs/plans/07-catalogo-publico-spec.md`, que prevalece sobre reglas históricas de catálogo privado.
- E3 usa `referrals.access.active_folder_access(user, profile)` para recomendaciones privadas; E4 usa `referrals.access.locked_folder_access(user, profile_id)` si se aporta una referencia dentro de la transacción. El consumo directo permite colaborador nulo; una referencia inválida nunca degrada a directo. Ambos consumos exigen Prestador publicado con beneficio publicado/vigente, QR/PIN válido y Cliente activo con email verificado; el interruptor del catálogo solo afecta visibilidad pública. Ninguna etapa infiere acceso por existencia histórica de `FolderAccess`.
- GitFlow obligatorio: main estable, develop integración, feature/*, release/* y hotfix/*. Commits Conventional Commits con descripción en español. No fusionar PRs. Ver `docs/gitflow.md`.
- Backoffice en español: definir nombres de aplicaciones/modelos/campos con `verbose_name`/`verbose_name_plural` y descripciones de columnas/acciones administrativas. Mantener identificadores de código, roles técnicos, tablas, campos y contratos API; las etiquetas de presentación no deben renombrarlos. El rol `TOURIST` se muestra como Cliente.

## Verificación

Ejecutar comprobaciones relevantes antes de cada commit: pruebas de backend sobre PostgreSQL, lint, tipos y build del frontend según el cambio. Documentar el comando y resultado. No afirmar que una integración externa está validada si solo se probó un adaptador simulado.

## Herramientas del repositorio

- Backend: Python 3.13.16 y uv 0.11.3. `backend/pyproject.toml` y `backend/uv.lock` son la fuente única; el entorno nativo vive en `backend/.venv` (ignorado). En Docker uv instala con `--locked` en `/opt/venv`, fuera del montaje `backend:/app`.
- Frontend: Node 24.19.0 y pnpm 11.22.0. `frontend/package.json` declara `packageManager`, `pnpm-lock.yaml` es la fuente única y `pnpm-workspace.yaml` permite solo los scripts requeridos. Instalar con `pnpm install --frozen-lockfile`.
- Docker Compose es la opción local predeterminada y no requiere Python, uv ni Node en el host. Una ejecución nativa de Django requiere PostgreSQL, Redis, SMTP local y variables de entorno configuradas para servicios accesibles desde el host; no uses `db`, `redis` ni `mailpit` como hostname fuera de Docker.
- No montar entornos `.venv` ni `node_modules` del host en contenedores. No usar SQLite para validar el dominio.

## Delegación

Los implementadores no crean otros subagentes ni sus propios revisores. El orquestador asigna trabajo acotado y revisores independientes. Usar modelos económicos para trabajo mecánico y un modelo de juicio adecuado para seguridad y concurrencia. Reportar dudas y hallazgos en archivos, sin duplicar historiales extensos.
