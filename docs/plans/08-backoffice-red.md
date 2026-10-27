# Backoffice operativo de la red — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implementar una tarea por vez, con revisión independiente y verificación antes de cada commit.

**Goal:** entregar dashboards funcionales para un Prestador con un negocio y un Colaborador con recomendaciones por beneficio elegido.

**Architecture:** reutilizar autenticación y APIs de gestión existentes; reemplazar la autorización de carpeta por selecciones explícitas de beneficios, conservando las asociaciones históricas y las transacciones financieras. Una shell React de dashboard integra las vistas por rol.

**Tech Stack:** Django/DRF, PostgreSQL, Redis, React/TypeScript/Tailwind; Docker, uv y pnpm fijados en el proyecto.

**Spec:** [08-backoffice-red-spec.md](08-backoffice-red-spec.md), con las correcciones confirmadas del usuario.

## Global Constraints

- Cuatro roles existentes; cliente principal, Admin en Django; sin tienda ni analíticas.
- Un negocio por usuario Prestador, selección concreta de beneficio por Colaborador habilitado; permisos del servidor, no del sidebar.
- Sin borrar asociaciones históricas, grants, consumos o créditos; no asignar ofertas futuras automáticamente.
- Mantener transacciones, idempotencia, QR versionado, JWT en memoria, CSRF y aislamiento de sesión.
- GitFlow `feature/backoffice-red` → develop, dependencia explícita del PR #9; sin merges ni force push. Conventional Commits en español.
- Informes de agentes solo en el workspace ignorado; documentación durable al cierre. No versionar cuentas ni QR/PIN.

## Review Focus

- Dos ofertas del mismo prestador: seleccionar una nunca habilita detalle/medio de la otra; nueva oferta tampoco se hereda.
- Retirar/expirar/editar a borrador la última selección revoca proveedor/red/consumo referido; directo y replay financiero siguen correctos.
- Carrera entre quitar selección y acreditar, duplicados de selección y segunda membresía de negocio: restricciones y bloqueos reales PostgreSQL.
- Colaborador deshabilitado/QR rotado/sesión cambiada retira listas y Blob/QR tardíos; escrituras no dejan feedback de otra cuenta.
- Catálogo general apagado: selector y recomendaciones privadas autorizadas siguen disponibles; las URLs públicas continúan cerradas.

## Task 1: Dominio, migraciones y API segura

**Files:** providers models/admin/access/views/serializers/urls/network y nuevo módulo de recomendaciones; referrals access si requiere corregir orden de locks; credits vista/URL PNG y pruebas de elegibilidad; migraciones nuevas, seeds y fixtures de pruebas; docs api/modelo/reglas/AGENTS/CONTEXT.

**Interfaces:** modelo `FolderBenefit`, unicidad de ProviderMembership.user, APIs y DTO exactos de la spec. Frontend sigue consumiendo los contratos privados existentes por carpeta, con selección concreta en servidor. No cambiar respuesta de lista de negocios propios (array de cero o uno).

- [x] Escribir/ejecutar regresiones de selección concreta, aislamiento, revocación, catálogo privado apagado, duplicados/carreras, migración sin ofertas futuras y negocio único.
- [x] Implementar migración conservadora y recomendaciones como única autoridad de beneficios privados; cambiar todas las rutas, medios, red, elegibilidad referida y semillas. Conservar FolderProvider histórico sin capacidad de otorgar acceso; Admin lo consulta, gestiona FolderBenefit nuevo.
- [x] Implementar APIs propias del Colaborador y PNG de QR propio del Prestador, validación de borrado protegido con conflicto y herencia demo en altas de ofertas. No introducir métricas ni privilegios de publicación.
- [x] Ejecutar suite PostgreSQL/Redis, Ruff, makemigrations --check y OpenAPI --validate; documentar resultados y actualizar contrato/reglas/contexto.
- [x] Commit Conventional español y revisión independiente aprobada antes de Task 2. No aplicar migraciones en la base principal desde el worker.

## Task 2: Shell y paneles React por rol

**Files:** nuevos módulos acotados en `frontend/src/product/workspace/` (shell, API/tipos, Prestador, Colaborador, formularios/QR), integración ProductApp/Layout, api.ts FormData, estilos aislados; pruebas de workspace y sesión; guías frontend/DEV/ToDo.

**Interfaces:** rutas, secciones y DTO de la spec y Task 1; mantener cliente API seguro existente. Un único negocio sin selector; Colaborador agrega/quita beneficios concretos. Imágenes y PNG como Blob privado y enlaces externos sanitizados.

- [x] Regresiones de login/restauración/rutas por rol, acciones CRUD permitidas, validaciones, alta/repetición/quita de recomendación, estados vacíos/deshabilitados, permisos y respuestas tardías de cambio de cuenta.
- [x] Implementar shell lateral responsive y vistas de la spec, feedback de formularios y estados reales; acceso al panel en header y `/espacio` compatible. No reutilizar placeholder ni crear botones sin acción o gráficos ficticios.
- [x] Integrar multipart sin romper JSON, refresh/reintento/cancelación; QR protegido sin servicios externos, storage ni query strings. Formularios PIN solo escritura.
- [x] Ejecutar pnpm test/lint/typecheck/build secuencialmente para evitar contención; comandos bloqueados y auditoría en CI. Actualizar documentación de la nueva etapa y cuentas demo sin publicar secretos.
- [x] Revisión Task 2/integración y QA aprobados en `2405cae`; [PR #10](https://github.com/SebaaM/llave-extra/pull/10) publicado contra develop sin fusionar, dependiente del #9. CI `bc36bc0` aprobado; estado vigente en el PR. Detenerse antes de E5/E6.
