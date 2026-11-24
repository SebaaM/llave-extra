# Perfiles y comisiones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal** · Completar la cuenta propia y gestionar una comisión por consumo referido validado con QR y PIN.

**Architecture** · Reutilizar la verificación E2. Ampliar E4 con el beneficio histórico y una ficha transaccional. Mantener el circuito de pago externo en el dominio `commissions` y presentar sus pasos en los paneles por rol.

**Tech Stack** · Django 5.2, DRF, PostgreSQL, Redis, React, TypeScript, pnpm y Docker Compose.

**Spec** · [Diseño de perfiles y comisiones](../specs/2026-11-10-perfiles-y-comisiones-design.md).

## Restricciones globales

- Cuatro roles, cuenta propia por sesión y negocio del Prestador por membresía vigente. Administración exige cuenta activa, `ADMIN`, `is_staff` e `is_superuser`.
- Una acreditación por Cliente y Prestador con el único PIN del negocio. Un referido válido requiere `FolderBenefit` seleccionado y vigente, con acceso activo revalidado dentro de E4.
- Transacción, auditoría y restricciones PostgreSQL para cada transición. Decimales ARS y reintentos con cuerpo y clave originales. Historial de créditos y de comisiones protegido contra ediciones retroactivas.
- CBU y alias cifrados, DTO separados, respuestas privadas `no-store`. Los valores bancarios quedan fuera del panel Prestador, logs y resultados idempotentes.

## Focos de revisión

- Una revocación de membresía o carpeta concurrente impide una escritura posterior.
- Un intento histórico exacto recupera su resultado después del corte. Una referencia nueva exige beneficio exacto.
- Una aprobación concurrente con anulación respeta un único resultado pagable. Un informe tardío abre una incidencia.
- Un cambio de tasa o declaración invalida una aprobación basada en una versión anterior. Cambios posteriores conservan el snapshot.
- Una respuesta tardía tras cambiar de cuenta se descarta, incluidos perfil bancario y revelación.

### Tarea 1. Perfil, email y datos bancarios

**Archivos** · `backend/accounts/{urls,profiles,bank,models}.py`, migración `accounts`, pruebas de cuenta, dependencias y ajustes de clave si se necesitan. Componentes de cuenta en `frontend/src/product/`; orquestación de sesión en `ProductApp.tsx` y enlaces de Workspace en la tarea 5.

**Interfaces**

- `GET/PATCH /api/v1/auth/profile/` usa `{first_name,last_name}` con nombre y apellido requeridos en PATCH. La respuesta incluye `first_name`, `last_name` y `complete`.
- `GET/PUT /api/v1/auth/bank-details/` usa escritura `{cbu,alias}` y lectura `{configured,cbu_masked,alias_masked}`. Separa el acceso del resto de la identidad.
- `accounts.bank.locked_bank_version(user_id) -> UUID | None` para aprobación y `accounts.bank.reveal_bank_details(user_id) -> dict[str,str] | None` para el servicio autorizado. El helper de lectura devuelve `cbu` y `alias`. El llamador registra la autorización y auditoría.
- Exponer el formulario como `ProfileSettings({ user, onResend, notice })` en `frontend/src/product/ProfileSettings.tsx`. La integración de cuenta decide el contenedor según el rol.

- [x] Añadir pruebas para rol propio, CBU con ceros iniciales, dígitos incorrectos, enmascarado y respuesta tardía de otra sesión.
- [x] Implementar las APIs, la migración y el formulario. Usar verificación existente y refrescar la identidad desde Cuenta.
- [x] Ejecutar pruebas de cuenta, Ruff y verificación frontend.

### Tarea 2. Beneficio en la acreditación

**Archivos** · `backend/credits/{models,serializers,services,views}.py`, migración de historial, `backend/providers/access.py`, configuración de rutas y pruebas E4. `frontend/src/product/{ConsumptionPage,useVisitCommand,api,VisitResult}.tsx` o `.ts` según el archivo existente.

**Interfaces**

- `POST /api/v2/consumptions/options/` recibe `{folder_id,qr_token}` y devuelve `{benefits:[{id,title}]}`. Sesión de Cliente y permisos vigentes en el servidor.
- `POST /api/v2/consumptions/` exige `benefit_id` y `folder_id`. La respuesta es la de E4. V1 conserva directos y reintentos exactos tras el corte configurable `REQUIRE_REFERRED_BENEFIT`.
- `Consumption.benefit_id` es un UUID histórico nullable. `benefit_title` preserva el título. `benefit_demo` indica que el consumo específico es de demostración. El servicio invoca `commissions.services.record_referral(consumption)` tras la escritura y `record_annulment(consumption, actor, reason)` dentro de la anulación.

- [x] Añadir casos de beneficio ajeno, revocación, corte, reintento histórico y carrera por acreditación única.
- [x] Implementar validación de opción, captura histórica, migración, compatibilidad y selección junto al PIN. Usar la misma clave para un intento incierto en su ruta original.
- [x] Ejecutar pruebas E4 en PostgreSQL y pruebas del flujo QR en frontend.

### Tarea 3. Dominio y APIs de comisiones

**Archivos** · Nueva app `backend/commissions/` con modelos, servicios, migraciones, serializers, vistas, rutas y pruebas. Integración de app y URLs en tarea 5.

**Interfaces**

- Colecciones paginadas `GET /api/v1/admin/commissions/` y `/api/v1/provider/commissions/` con `count,next,previous,results`. Filtros `state`, `provider`, `collaborator`, según rol. Detalle `GET .../{consumption_uuid}/`. DTO con `id`, `created_at`, `tourist_name` (solo Admin), `provider_id`, `provider_name`, `collaborator_id`, `collaborator_name`, `benefit_title`, `state`, `next_step`, `version`, `declaration`, `approval`, `payment`, `events`, `actions` y `incident`. Estados `AWAITING_PROVIDER`, `TO_PAY`, `COMPLETED`, `NO_COMMISSION`, `ANNULLED`, `HISTORICAL`, `DEMO`. `actions` es una lista de comandos disponibles.
- `POST .../{id}/actions/{action}/` exige `Idempotency-Key` y `version`. Prestador usa `declare` con `outcome` (`CONSUMED` o `NOT_CONSUMED`) y `amount` decimal string o null, y `report-payment` con `date`, `reference`, `amount` y `approval_id` para elegir la aprobación si existen varias candidatas a informe tardío. Admin usa `request-correction` con `reason`, `approve` con `amount` y `reason`, `complete-no-commission` con `reason`, `reconcile` con `receipt_checked` y `receipt_confirmed`, `reopen`, `reject-report`, `open-incident`, `close-incident` con `reason`. Resultado saneado `{id,state}`. Revelación administrativa explícita `POST .../{id}/bank-details/` con `reason` (`prepare`, `verify`, `incident`).
- `GET /api/v1/admin/commission-rules/` devuelve `{global,providers}` con `{provider_id,provider_name,rate,version}`. `PUT .../global/` y `PUT .../providers/{provider_id}/` usan `{rate,version}`, decimal o null, y `Idempotency-Key`. `version` es null para un recurso inexistente. Un null elimina la excepción o desactiva la tasa global.
- `declaration` incluye `outcome`, `amount`, `created_at`. `approval` incluye `base_amount`, `rate`, `amount`, `created_at`. `payment` incluye `date`, `reference`, `amount`, `created_at`. Cada evento incluye `kind`, `label`, `created_at`, `actor`, `reason`. `rate` vigente va en `current_rate`. `incident` es booleano. El servidor retorna null para declaraciones, aprobaciones y pagos ausentes.

- [x] Añadir pruebas de permisos, tasas, cambio de versión, declaración, pago externo, estados, historia, demo y anulación concurrente.
- [x] Implementar consultas y transiciones PostgreSQL con orden de bloqueos compartido con E4. Exponer CBU/alias únicamente por revelación administrativa auditada. Validar el documento OpenAPI.
- [x] Ejecutar pruebas focales de comisiones y autorización.

### Tarea 4. Paneles de declaración y comisiones

**Archivos** · `frontend/src/product/admin/Commissions.tsx` y `frontend/src/product/workspace/ReferredConsumptions.tsx` con estilos y pruebas, navegación Admin y Workspace en tarea 5.

**Interfaces** · `Commissions({ section }: {section: 'commissions' | 'commission-rules'})` y `ReferredConsumptions()`, contra la API de tarea 3. Usar el cliente `api` vigente y conservar cuerpo, ruta y clave de un envío incierto.

- [x] Probar estado y paso pendiente con el acordeón cerrado, filtro paginado, teclado y reintento de una mutación incierta.
- [x] Construir listado paginado y detalle con historial, formulario de declaración, acciones disponibles y reglas de comisión. Mostrar errores por campo y estados de carga, vacío y conflicto.
- [x] Ejecutar pruebas UI, lint y tipos.

### Tarea 5. Integración y documentación

**Archivos** · `backend/config/{urls.py,settings/}`, `frontend/src/product/{ProductApp.tsx,workspace/Workspace.tsx,admin/AdminWorkspace.tsx}`, `docs/{api.md,panel-administracion.md,plans/00-roadmap.md}`, `AGENTS.md`, `CONTEXT.md` y `ToDo.md`.

- [x] Conectar las rutas reales y el refresco de sesión. Ajustar Compose y el ejemplo de variables para el despliegue y la clave bancaria si hace falta.
- [x] Verificar migraciones y OpenAPI. Ejecutar PostgreSQL y Redis aislados, Ruff, suite frontend, lint, tipos y build. Registrar comandos y resultados.
- [x] Revisar el diff completo, sincronizar documentación y crear el commit de la rama `feature/perfiles-comisiones` con mensaje en español después de la verificación.

## Resultados de verificación

- Suite completa de backend con PostgreSQL y Redis aislados. `python -m pytest -q -p no:cacheprovider` dio 494 aprobadas y tres incidencias en dos casos preexistentes de tienda bajo Windows. Un ID parametrizado excedía el límite de variables de entorno y el otro caso leía un comprobante UTF-8 con la codificación del sistema. Tras ajustar ambos casos, `python -m pytest -q -p no:cacheprovider shop/tests/test_payments.py -k 'adapter_malformed_bounds or commands_seed_idempotence_and_demo_receipts'` dio 5 aprobadas.
- Backend final. `python -m pytest -q -p no:cacheprovider accounts/tests/test_profiles.py credits/tests/test_credits.py commissions/tests` dio 55 aprobadas. `ruff check .`, `python manage.py makemigrations --check --dry-run` y `python manage.py spectacular --validate --fail-on-warn` finalizaron con código 0.
- Frontend. `pnpm run test:proxy` dio 1 aprobada y `pnpm exec vitest run --maxWorkers=4 --fileParallelism` dio 398 aprobadas. Tras plegar los filtros secundarios, `pnpm exec vitest run src/product/admin/Commissions.test.tsx` dio 8 aprobadas. `pnpm run lint` y `pnpm run build`, que incluye TypeScript, finalizaron con código 0.
- Navegador con React compilado y tres consumos sintéticos sobre Django y PostgreSQL. En escritorio se vieron los estados con los acordeones cerrados, el filtro «Completado» devolvió un registro y el historial mostró el QR validado y la referencia de transferencia. A 375 px el primer estado quedó dentro de la primera pantalla, el acordeón abrió y el documento mantuvo el ancho del viewport.
