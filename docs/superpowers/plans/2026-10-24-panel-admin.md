# Panel administrativo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implementación secuencial con revisión independiente por tarea; los implementadores no crean subagentes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar gestión React completa del Administrador y configuración efectiva del sitio, sin analíticas.

**Architecture:** Un módulo Django `administration` expone DRF administrativo y configuración pública limitada, reutilizando el dominio E2–E5. Un espacio React `/gestion` consume contratos explícitos, con el transporte JWT existente. Auditoría, comandos idempotentes y precondiciones de escritura protegen los cambios.

**Tech Stack:** Django/DRF, PostgreSQL 17/Redis, React/TypeScript/Tailwind; Python 3.13.16/uv 0.11.3, Node 24.19.0/pnpm 11.22.0; Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-24-panel-admin-design.md` (aprobado).

## Global Constraints

- Analíticas E6, UI de compra/canje del Cliente, cobros reales, sandbox externo, despliegue y scheduler permanecen pendientes.
- Django + DRF, PostgreSQL, React + TypeScript + Tailwind; Docker local. No usar SQLite para validar dominio o integración.
- Existen exactamente cuatro roles: Cliente (`TOURIST`), Colaborador (`COLLABORATOR`), Prestador (`PROVIDER`) y Administrador (`ADMIN`). El registro público crea solo `TOURIST` sin privilegios.
- La autorización administrativa requiere usuario activo, rol `ADMIN`, `is_staff` e `is_superuser`, en cada endpoint/acción/medio.
- `FolderBenefit` es la única selección canónica. Preservar locks perfil → prestador → beneficio; locks de perfil con joins usan `of=("self",)`. Un usuario Prestador tiene como máximo un negocio.
- Tienda: locks User → Wallet → Order → Product ordenados por PK; reutilizar E4/E5. HTTP fuera de atomic, historia protegida, stock por delta con motivo, payment_confirmed monotónica, refund solo por GET autoritativo.
- Backoffice en español; `TOURIST` se muestra como Cliente. No versionar secretos, `.env`, QR/PIN ni cuentas reales.
- GitFlow `feature/panel-admin` → `develop`, dependiente de #11/#10; no merges ni force push. Conservar documentos locales preexistentes. Commits Conventional Commits con descripción en español.

## Review Focus

1. Ediciones concurrentes desde React, APIs de Prestador y Django Admin: precondición obsoleta devuelve 409 sin pérdida de cambios.
2. Timeout/replay de comandos sensibles: mismo resultado/efecto único, clave reutilizada con otra carga devuelve 409; QR/PIN nunca persistidos en respuestas/auditoría.
3. Revocación o cambio de identidad mientras hay listas, imágenes o escrituras pendientes: no repoblar ni mostrar información de la sesión previa.
4. Publicación/configuración: cambios visibles en consumidores reales, interruptor público no rompe carpetas/consumos y snapshots anteriores se conservan.
5. Invitación SMTP fallida, medios no disponibles y errores parciales: informar estado real sin éxito inventado, sin filtrar tokens ni guardar cambios incompletos.

## Decisiones de interfaz y concurrencia

Base verificada: `a584e99`, PR #11 y #10 abiertos según GitHub al inicio. Se crea rama desde E5 existente para conservar dependencias; no se integran PRs.

Crear app Django `administration` con archivos por responsabilidad, no un viewset universal sin permisos/campos explícitos. Prefijo `/api/v1/admin/`; público `GET /api/v1/site-settings/`. Listas `{count,next,previous,results}`, 20 por defecto y máximo 100; `page`, `search`, filtros de recursos, orden estable por PK como desempate. El detalle editable incluye `version`; PATCH exige esa precondición en cuerpo, multipart también, y devuelve 409 si falta/no coincide. Las altas no exigen versión.

La versión es un HMAC determinista del estado persistido relevante (incluidos nombres de archivos), calculado también desde objetos recargados bajo locks antes de escribir. Detecta cambios por cualquier ruta, sin timestamps que dependan de hooks omitidos. Nunca incluir claves/hashes sensibles en DTO; la firma usa secreto del servidor y recurso/PK. Para comandos de estado, revalidar en servicios y usar `Idempotency-Key` obligatorio (máximo 128), actor + acción + clave únicos, huella de carga con HMAC; fila dedicada bloqueada antes de ejecutar dominio, sin bloquear fila de actor como lock global. Respuestas persistidas solo sanitizadas; consultas de QR separadas y actuales. Guardar resultado, efectos y auditoría local en atomic. Comandos de servicios que agenden operaciones remotas no hacen HTTP.

La auditoría registra nombres de campos modificados, sin valores privados. Configuración/modelos faltantes retornan defaults sin escribir en GET. En PATCH crear singleton y verificar versión de defaults de forma transaccional. Validar `full_clean`/serializadores estrictos y constraints; 400 por campos extra, 409 por conflictos protegidos. Guardas de privilegios antes de accesos a recursos.

## Task 1: Configuración del sitio y fundamentos administrativos

**Files:** crear `backend/administration/{__init__,apps,models,permissions,concurrency,commands,serializers,views,urls}.py`, migraciones y `tests/test_settings.py`; modificar `backend/config/settings/base.py`, `backend/config/urls.py`, `docs/api.md`. Dividir serializers/views en paquetes si crecen, manteniendo responsabilidades claras.

**Interfaces:** produce `IsProgramAdmin`; helpers de versión/precondición; `run_command(actor, action, key, payload, callback)` (API exacta documentada en reporte); `record_audit`; modelos `SiteSettings`, `AdminAudit`, `AdminCommand`; DTOs y endpoints siguientes.

- `GET /api/v1/site-settings/`: `site_name`, `home_title`, `home_description`, `footer_text`, `contact_email`, `whatsapp_url`, `instagram_url` exclusivamente. Defaults de portada actual; contactos vacíos.
- `GET/PATCH /api/v1/admin/settings/{general,catalog,credits,shop}/`: campos del grupo más `version`. General usa DTO público; catálogo campos existentes `enabled,network_title,network_layout,network_theme,network_background,network_page_size,network_interval_seconds`; créditos `base_reward,target_visits`; retiro `pickup_name,pickup_address,pickup_hours,pickup_enabled` y `payment_provider` readonly.
- `GET /api/v1/admin/activity/`: lista auditada con filtros `search,actor,action,resource`; DTO `id,actor_email,action,resource,object_id,changed_fields,reason,created_at`.
- Helpers de `StrictSerializer`/errores sin filtrar validaciones internas. Configuraciones requieren validación de URL HTTPS con dominio exacto permitido (`wa.me`, `api.whatsapp.com`, `www.instagram.com`, `instagram.com`), sin userinfo ni hosts parecidos; email válido y texto plano limitado.

Steps:
- [ ] Escribir pruebas focales RED de permisos (incluidas flags parciales), GET sin escrituras, configuración efectiva y DTO público restringido, validación, precondiciones y auditoría sin secretos.
- [ ] Implementar los modelos/helpers/configuración; conservar servicios/locks de política y snapshot de retiro. Validar formulario stale luego de escritura fuera del panel.
- [ ] Probar comandos sintéticos bajo concurrencia/replay y rechazo de carga diferente, atomicidad/rollback. No guardar PIN/QR ni siquiera en fingerprint sin HMAC.
- [ ] Verificar en Docker aislado `pytest -q administration/tests/test_settings.py`, suite backend completa, Ruff, `makemigrations --check --dry-run`, OpenAPI `--validate --fail-on-warn`; reportar comandos y resultados. No modificar la BD principal.
- [ ] Autorrevisión, commit solo archivos propios y reporte `task-1-report.md` con APIs/helpers exactos para Task 2/3. Gate independiente antes de Task 2.

## Task 2: API de gestión operativa completa

**Files:** crear módulos `backend/administration/{resources,resource_serializers,operations,media,dashboard}.py` (o paquetes con nombres equivalentes por responsabilidad), `tests/test_management.py`, `tests/test_commands.py`; extender `urls.py`, `docs/api.md` y fundamentos solo si es necesario.

**Interfaces:** consume Task 1, produce contrato documentado antes de Task 3. Recursos bajo `/api/v1/admin/`: `users`, `providers`, `benefits`, `collaborators`, `consumptions`, `wallets`, `adjustments`, `products`, `orders`, `cancellations`, `credit-rules`, `stock-adjustments`, `payment-operations`. List/detail `/<resource>/[<id>/]`; POST/PATCH solo operaciones de alta/edición permitidas por spec, sin DELETE genérico. Lecturas con DTO explícito y sin payloads/historia editable.

- `users`: campos `id,email,first_name,last_name,role,is_active,email_verified,version`; alta solo TOURIST/PROVIDER/COLLABORATOR con contraseña inutilizable. Editar nombres/actividad (no self-disable, no editar otro ADMIN desde este flujo), desactivar revoca AuthSession; roles y flags readonly. `POST users/<id>/invite/` con key, rate limit y SMTP fuera de atomic mediante callback de commit; reutilizar reset E2. Respuesta distingue fallo de envío y permite reenvío explícito con nueva key sin secretos. Email verificado sigue su flujo E2.
- `providers`, `benefits`, `products`: DTO completo operativo según modelos, `image_url` administrativo y `version`; alta/edición multipart, medios privados GET `/<resource>/<id>/image/`. Producto stock readonly; delta por comando. Borradores no se excluyen de gestión. Beneficio no cambia prestador después de alta; prestador conserva demo/provenance y productos no convierten datos demo en reales.
- `collaborators`: perfil con usuario readonly después de alta, enabled/qr_version readonly en formularios, presentación red y selecciones concretas. `GET collaborators/<id>/recommendations/`; comandos agregar/quitar seleccionando `benefit_id`; habilitación y rotación por métodos existentes.
- `POST <resource>/<id>/actions/<action>/` acepta body estricto e `Idempotency-Key`; acciones `providers`: assign-user/unassign-user (user_id; reassignment explícita), set-pin (pin), rotate-qr; `collaborators`: enable/disable/rotate-qr/add-benefit/remove-benefit; `consumptions`: annul (reason); `adjustments`: resolve (reason,resolution); `products`: adjust-stock (reason,delta); `orders`: prepare/deliver/refund (reason); `cancellations`: approve/reject (reason); `payment-operations`: retry (reason). `credit-rules` alta/edición y eliminación explícita por `remove` conservan métodos actuales. Acciones que modifican filas de formularios incluyen precondición vigente donde corresponda, además de idempotencia.
- QR dedicados `GET providers/<id>/qr/`, `GET collaborators/<id>/qr/` JSON de URL vigente y rutas `qr.png`; no QR en listas ni comandos persistidos; `no-store`. La inicialización de PIN/credencial valida negocio y se audita.
- `GET dashboard/`: `{counts,queues,settings,recent_activity,refreshed_at}` con keys/filtros exactos en docs API/reporte; consulta acotada con enlaces de filtro que React resuelve. Operativos actuales, no analítica.
- Pedidos detail incluye líneas, pickup_snapshot, auditoría sanitizada, cancelaciones y operaciones recuperables sanitizadas; billeteras detail movimientos paginables. Historial/read-only no se acepta por mass assignment. Detalles permiten cliente/provider/collaborator identificables sin N+1.

Steps:
- [ ] RED focal: roles/permisos de acciones y archivos, privilegios por campos extra, self-disable, activación/invitación, unicidad de membresía y selección beneficio específica.
- [ ] Implementar listas y detalles con filtros estado/rol/actividad/negocio/fechas aplicables y endpoints de medios/QR privados; no confiar en IDs del cliente para autorización.
- [ ] Implementar comandos invocando E4/E5 y locks actuales; cubrir duplicate delta, rotate/replay/QR vigente, anulación/ajuste, preparación/entrega/cancelación/refund/retry, rollback y replay conflictivo. Probar concurrencia entre comando y consumidor de dominio relevante.
- [ ] Cubrir configuración/DTO dashboard en estados vacíos y poblados, consultas acotadas, imagen inválida/ausente, SMTP fallido y reenvío. Los conflictos devuelven estado real sin mutaciones parciales.
- [ ] Verificar suite backend completa PostgreSQL/Redis, Ruff, drift, OpenAPI; actualizar docs/api.md con shapes/acciones exactos, autorrevisar, commit y reporte Task 2. Gate independiente antes de Task 3.

## Task 3: Panel React, configuración pública e integración

**Files:** crear `frontend/src/product/admin/` con `AdminWorkspace.tsx`, `api.ts`, `types.ts`, `hooks.ts`, `UI.tsx`, `Dashboard.tsx`, `ResourceList.tsx`, módulos/fichas/formularios por área, `Settings.tsx`, `admin.css`, pruebas pertinentes; crear hook/contexto público de configuración. Modificar `ProductApp.tsx`, `Layout.tsx`, `HomePage.tsx`, workspace `data.ts`/navegación y pruebas afectadas. Usar DTOs reales Tasks 1/2, sin endpoints ficticios.

**Interfaces:** rutas `/gestion`, `/gestion/{usuarios,prestadores,beneficios,colaboradores,consumos,billeteras,ajustes,productos,pedidos,cancelaciones,actividad,configuracion,cuenta}`; alta `/nuevo`, detalle `/<id>`, edición dentro de detalle o `/editar`. Configuración tabs `general,catalogo,creditos,retiro` en query. Filtros y page query sobreviven navegación atrás/recarga.

Steps:
- [ ] RED UI: routing por rol, login ADMIN a `/gestion`, sin APIs de Cliente, 401/403 limpia todo, fetch viejo no repuebla, formularios stale409 preservan texto para recargar, idempotency key estable ante timeout/reintento.
- [ ] Implementar shell consistente con workspace, sidebar móvil/teclado, dashboard clicable con refresh, tablas paginadas/filtradas y fichas de todos los recursos operativos. Estados reales de carga/error/vacío; no usar valores inventados ni solo enlaces a Django.
- [ ] Formularios explícitos para toda alta/edición/acción de Tasks1/2; QR actual con descarga segura, PIN password jamás persistido; formularios financieros con motivo y confirmación. Usar `api` existente, FormData sin Content-Type manual, AbortController/session version y limpiar blobs. Cambios sin guardar protegidos para navegación interna y cierre/recarga; errores de envío SMTP diferenciados.
- [ ] Configuración con cuatro tabs y guardados independientes, vista previa red con opciones reales; reglas por prestador. Versiones y conflictos reales. Payment provider readonly y límites de snapshots explicados.
- [ ] Conectar configuración pública a título/descripcion portada, metadatos, marca textual/accesible y pie/contactos; defaults iguales a sitio actual si no hay configuración, fallo comunicado sin simular guardado. Mantener logo fijo y colores/tipos existentes. No disparar APIs administrativas desde páginas públicas.
- [ ] Pruebas enfocadas en acciones e invariantes (no mirrors del JSX), suite frontend completa, proxy, lint, tipos y build con pnpm. QA/bugs se documentan; autorrevisión, commit y reporte Task 3. Gate independiente.

## Task 4: Integración, QA, documentación y entrega

**Owner:** orquestador; fixes de producto se devuelven al implementador correspondiente y se revisan. Archivos: `docs/verification/09-panel-admin.md`, `CONTEXT.md`, `ToDo.md`, `AGENTS.md`, `docs/plans/00-roadmap.md`, documentación de uso/contrato si hace falta.

- [ ] Aplicar migraciones primero en proyecto QA aislado y probar upgrade sin pérdida de datos; no seed ni rotar cuentas existentes de la base principal. Validar HTTP real E2+admin y regresiones de roles/configuración pública con fixtures sintéticos.
- [ ] QA real escritorio/320 px por navegador: login, dashboard, filtros, configuración, alta/edición, QR/PIN, selección, delta y pedidos sintéticos. Nunca guardar screenshots con QR/PIN o cuentas reales.
- [ ] Ejecutar comprobaciones finales pertinentes sobre código final; conservar evidencia y límites externos. Actualizar estado/roadmap/instrucciones y documento aprobado, distinguiendo lo implementado, probado y pendiente.
- [ ] Revisión independiente de toda la rama en modelo de juicio; corregir hallazgos con una ola y re-review focal, según skill. No declarar entrega completa con fallos pendientes de seguridad/concurrencia.
- [ ] Commit documental, push, PR a develop con dependencia #11/#10 y CI consultado. Adjuntar PR al chat; no fusionar. Aplicación local de migraciones solo tras revisión con respaldo/preflight sin seed; informar si no se aplica por limitación real.

## Autorrevisión del plan

Cobertura: configuración/seguridad/comandos comunes Task1; todo dominio y bandejas Task2; navegación/operaciones/UI pública Task3; QA/evidencia/entrega Task4. Las interfaces de tareas 1→2→3 se fijan en docs/api.md antes de dispatch posterior. Sin implementadores simultáneos ni ediciones compartidas durante un gate. Plan de ejecución solicitado explícitamente por el usuario; no requiere otra ronda de confirmación para implementar.
