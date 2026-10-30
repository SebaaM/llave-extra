# Plan de implementación aprobado

Corrección aprobada 30/10/2026: navegación y contenido de Cliente sin jerga de roles, recomendaciones solo recibidas, inicio reordenado, carrusel y pasaporte libreta. [Diseño](../superpowers/specs/2026-10-30-ajustes-vista-cliente.md), [plan](../superpowers/plans/2026-10-30-ajustes-vista-cliente.md) y [antes/después](../verification/13-ajustes-vista-cliente.md). PR #16 en borrador, sin fusionar hasta aprobación del cliente.

Estado posterior, 30/10/2026: frontend visual T1–T8 implementado en `feature/frontend-cliente-visual`; sus revisiones por etapa están registradas. El cierre de QA, revisión integral y entrega sigue pendiente. Ver [antes/después y evidencia](../verification/11-frontend-cliente-visual.md). Los párrafos siguientes describen cortes históricos.

Pedido vigente 27/10/2026: implementar primero la API del [plan visual del Cliente](../superpowers/plans/2026-10-27-frontend-cliente-visual.md). Backend T2/T2b implementado en `e3f04fa`, rama `feature/api-cliente-visual` nacida de develop `754982d` (PR #10 integrado). Categorías públicas completas y nombre actual del comercio en historial privado propio; no cambia POST/replay, reglas de negocio ni frontend. Suite 108 PostgreSQL/Redis, QA HTTP real y revisiones por tarea e integral aprobadas. Entrega en [PR #14](https://github.com/SebaaM/llave-extra/pull/14) hacia develop, abierto sin fusionar, tras autorización explícita del usuario. CI vigente en sus comprobaciones. [Evidencia](../verification/12-api-cliente-visual.md). Las pantallas y tipos/hooks siguen pendientes, al igual que E6 y la tienda transaccional. Los estados siguientes conservan el historial previo.
Pedido del 26/10/2026: adelantar únicamente el catálogo visual de la tienda de F3. Implementación pública con datos de ejemplo en frontend, sin compra/canje ni modificación de inventario real. [Plan acotado](../superpowers/plans/2026-10-26-catalogo-tienda-visual.md) y [evidencia](../verification/10-catalogo-tienda-visual.md). No inicia E6 ni auditoría activa; la UI transaccional y pedidos del Cliente continúan pendientes.

Pedido vigente 24/10/2026: dashboard ADMIN React y configuración implementados en `/gestion` (`affa345`), con 274 pruebas PostgreSQL/Redis, 115 UI y 1 proxy aprobadas. Migraciones locales conservan los datos. Revisión integral y focal aprobadas; [PR #12](https://github.com/SebaaM/llave-extra/pull/12) abierto, sin fusionar; CI vigente en sus comprobaciones; rama `feature/panel-admin`, dependiente de #11/#10 sin fusionar. [Plan](../superpowers/plans/2026-10-24-panel-admin.md), [checklist](../verification/09-panel-admin-checklist.md), [evidencia](../verification/09-panel-admin.md) y [guía](../panel-administracion.md). Django `/admin/` conserva sesión independiente; E6 y compra del Cliente quedan fuera. Las pausas históricas siguientes no impiden esta etapa autorizada.

Plan transversal solicitado el 24/10/2026: [auditoría de seguridad por feature/task](../superpowers/plans/2026-10-24-auditoria-seguridad.md), con [checklist](../security/checklist.md), hallazgos y correcciones mediante subagentes/revisión independiente. Preparación documental; ejecución todavía no iniciada. Audita lo implementado del corte y registra faltantes; no autoriza completar E6/F3 ni declara validación externa de pagos.

Estado vigente al 24/10/2026: E5 backend/API/Admin completada y revisada en `4c9a402`, entrega [PR #11](https://github.com/SebaaM/llave-extra/pull/11) contra develop, sin fusionar y dependiente de #10. CI de producto aprobado; HEAD vigente en las comprobaciones del PR. Ver [evidencia](../verification/05-tienda-pagos.md). Pausar antes de E6 y UI de tienda F3; sandbox externo pendiente. Las pausas de entregas anteriores que siguen son históricas.

> Corrección vigente del 19/10/2026: catálogo general público con interruptor administrativo, recomendaciones QR privadas y consumos directos sin colaborador. GitFlow obligatorio. [Especificación](07-catalogo-publico-spec.md) y [plan de corrección](07-catalogo-publico-gitflow.md) prevalecen sobre las descripciones históricas siguientes. E5/E6/F3 continúan pendientes; completar esta corrección y detenerse.

> Pedido posterior aprobado: adelantar únicamente los dashboards operativos Prestador/Colaborador de F3. Colaborador elige beneficios concretos del catálogo; usuario Prestador maneja un solo negocio. Admin continúa en Django. [Plan 08](08-backoffice-red.md) y [spec](08-backoffice-red-spec.md) prevalecen en este alcance; tienda y analíticas siguen pendientes.

Estado del plan 08: producto implementado y revisión independiente aprobada en `2405cae`, QA real de ambos roles y móvil completada con límites documentados. [PR #10](https://github.com/SebaaM/llave-extra/pull/10) abierto contra develop, dependiente del #9, sin fusiones. CI de producto `bc36bc0` aprobado (97 backend, 78 UI y 1 proxy); CI del HEAD vigente en el PR. Evidencia en [verificación](../verification/08-backoffice-red.md). Etapa cerrada; detenerse antes de tienda y analíticas.

Objetivo: reconstruir Llave Extra en etapas verificables, con PRs independientes y cuatro roles corregidos. El Cliente es el usuario principal; conserva el identificador técnico `TOURIST` por compatibilidad y no constituye un quinto rol. Colaborador (`COLLABORATOR`), Prestador (`PROVIDER`) y Administrador (`ADMIN`) tienen funciones distintas. El catálogo general muestra beneficios públicos configurables; las carpetas y asignaciones de colaboradores requieren acceso mediante un QR autorizado.

## Restricciones globales

Stack Django/DRF, PostgreSQL, React/TypeScript/Tailwind, Docker; Conventional Commits con texto en español. `.env-example` vacío, secretos locales ignorados. Datos de prueba identificados; documentación breve de arranque y cuentas. Sin merges automáticos. El PIN fijo tiene riesgo residual de compartirse; no equivale a prueba física de consumo.

## Task 1: E1 - Base del proyecto

Crear backend y frontend mínimos, Docker Compose, PostgreSQL, Mailpit, modelo por email inicial, configuración validada, salud, scripts multiplataforma, datos demo iniciales y CI. Verificar migraciones, PostgreSQL real, lint, tipos y build. Instrucciones cortas y contraseñas locales generadas. API aún sin dominio. Archivo: `01-base-proyecto.md`.

## Task 2: E2 - Autenticación y acceso privado

Registro/login/verificación/reset/JWT, sesiones revocables y límites de intentos. Definir roles ADMIN, PROVIDER, COLLABORATOR, TOURIST; el registro público crea únicamente Cliente (`TOURIST`) sin autoasignación de privilegios. Referencias de QR firmado por colaborador, versión y habilitación; carpeta y acceso del Cliente persistido solo al redimir QR válido autenticado. No devolver datos de carpeta a anónimos. Archivo: `02-autenticacion-api.md`.

## Task 3: E3 - Prestadores y carpetas

Prestadores, beneficios, pertenencia de usuario prestador y carpetas curadas por administrador. API filtra cada listado y detalle por acceso activo a la carpeta, pertenencia y estado. Prestador edita solo sus datos; colaborador solo consulta su carpeta y referencias. Cargar inventario de comercios como demo sin confundir ejemplos. Archivo: `03-comercios-colaboradores.md`.

## Task 4: E4 - Consumos y créditos

QR del prestador + PIN fijo hash, email verificado y referencia de carpeta activa cuando se aporta. El consumo directo permite colaborador nulo. Una acreditación de por vida por turista/prestador, idempotencia, transacciones, regla global/per-prestador y snapshot, libro de movimientos, saldo, progreso y ajustes pendientes con bloqueo de canjes. Archivo: `04-consumos-creditos.md`.

## Task 5: E5 - Tienda

Productos demo, stock, pedidos por dinero o créditos, canjes atómicos, reserva monetaria 15 minutos, retiro y cancelación revisada por administrador. Adaptador Mercado Pago Orders API y firma de webhook, idempotencia, tareas recuperables. Pruebas con adaptador simulado claramente identificadas y procedimiento sandbox; no afirmar validación real sin credenciales. Archivo: `05-tienda-pagos.md`.

## Task 6: E6 - Analítica y preparación operativa

Métricas por rol, referencias atribuidas, consumo/crédito/venta derivados del servidor, controles de seguridad, backups/restauración, tareas de reconciliación y documentación. Sin despliegue productivo ni cambio del sitio actual. Archivo: `06-analitica-salida.md`.

## Task 7: F1 - Prototipos de frontend

Etapa histórica: tres opciones React/Tailwind navegables (guía/pasaporte/beneficios), misma identidad y datos mock, usadas para elegir Beneficios como portada y Pasaporte en Mi viaje. La conexión a la API se entregó en F2. El código y las rutas de los prototipos se retiraron en el plan 07; las áreas de Colaborador, Prestador y Administrador conservan permisos propios. Archivo: `frontend.md`.

## Task 8: Herramientas - uv y pnpm

Preferencia confirmada: uv 0.11.3 para backend (Python 3.13, `pyproject.toml`, `uv.lock`, entorno Docker fuera del bind mount y `.venv` nativo opcional ignorado); pnpm 11.22.0 para frontend (versión fijada, `pnpm-lock.yaml` y scripts de compilación autorizados explícitamente). Docker, CI y guías usan instalaciones bloqueadas; `requirements.txt` y `package-lock.json` se retiran como fuentes duplicadas. Los locks originales de pnpm se conservan en el archivo local fechado. Verificar instalaciones limpias, PostgreSQL real, lint/tipos/tests/build y auditoría. Conservar archivos locales existentes. Informe de resultados en `task-8-report.md`.

## Task 9: F2 - Experiencia principal del Cliente

Elección confirmada por el usuario: Beneficios como dirección principal y Pasaporte en Mi viaje. Implementado en la rama F2: hero de valor/propósito, explicación del recorrido turístico, registro/sesión/email, QR privado, beneficios, consumo e historial/progreso conectados a APIs E2–E4, JWT en memoria, medios autorizados y módulos de producto acotados. No publica carpetas ni acuerdos no confirmados. Suite UI/API cliente aprobada localmente; revisión visual de escritorio por controlador pasó y revisión móvil/flujo real queda asentada en el informe de etapa. F2 depende de E2–E4 y no de la tienda ni de la analítica; E5 y E6 siguen antes de F3. Detalle en [plan frontend](frontend.md) e [informe Task 9](../../.superpowers/sdd/00-roadmap/task-9-report.md).

## Task 10: F3 - Tienda y espacios de la red

Completar tienda ARS o créditos y pedidos propios sobre servicios transaccionales, panel Prestador de propuestas/ofertas propias, panel Colaborador de recomendaciones/QR/métricas y acceso administrativo al backoffice existente. El servidor sigue siendo autoridad de permisos, stock, pagos y créditos. Verificar límites por rol, reintentos/errores y flujo real de canje demo; declarar sandbox externo pendiente si faltan credenciales. PR propio después de F2. Detalle en plan frontend.

## Orden de integración y GitFlow

E1 -> E2 -> E3 -> E4 -> F2 -> E5 -> E6 -> F3. F1 compartió base y contratos y permitió avanzar backend mientras se elegía el diseño. Hubo un primer commit documental en main y PRs históricos apilados. Desde la corrección del 19/10/2026 se usa GitFlow obligatorio: `main` estable, `develop` de integración y ramas `feature/*`, `release/*`, `hotfix/*`. El PR de esta corrección se dirige a `develop`, inicializado en la base revisada `415f235`; se conservan los PRs históricos. Pruebas y revisión antes de publicar cada PR; no fusionar desde este trabajo. Ver [flujo vigente](../gitflow.md).

La integración histórica de F1 y la migración de herramientas a uv 0.11.3 y pnpm 11.22.0 precedieron a E4. F2 usó la elección Beneficios + Pasaporte después de E4 revisado; E5 y E6 siguen pendientes, y F3 viene después de F2 y E6. Esto no cambia los cuatro roles persistidos.

## Cierre de etapa

Requisitos implementados y comprobados, registro de pruebas, revisión independiente, contexto/ToDo actualizados y PR adjunto al chat. Cualquier limitación externa queda declarada en el PR. Docker real es requisito para declarar pruebas PostgreSQL completas.

## Inicio autorizado E5 — 20/10/2026

El pedido actual revoca la pausa al cerrar plan 08 y autoriza E5 backend/API/Admin, según [especificación](05-tienda-pagos-spec.md) y [plan](05-tienda-pagos.md). Rama feature/tienda-pagos desde PR #10 revisado; PR a develop dependiente de #10 mientras siga abierto, sin fusiones. E6 y frontend de tienda siguen pendientes.


E5 Task 1 implementada localmente el 23/10/2026 y pendiente de revisión independiente. Catálogo/API/Admin, canjes y cancelación de créditos, snapshots protegidos y outbox monetario sin HTTP. Ver [evidencia Task 1](../verification/05-tienda-pagos-task-1.md). Task 2 sigue pendiente para pagos, vencimiento y reembolsos monetarios; frontend/E6 permanecen fuera de alcance. Pruebas solo sobre proyecto Docker aislado llaveextra-e5, sin migrar base principal.

Actualización 24/10/2026: E5 Task 1 `a7a6b59` aprobada por gate independiente sin hallazgos. Task 2 implementada localmente: pasarela Orders/fake durable, inbox/outbox, búsqueda por referencia, expiración/cancelación/refund con GET autoritativo; pendiente gate independiente, PR/CI y sandbox externo. Ver [evidencia E5](../verification/05-tienda-pagos.md) y [operación](../shop-operations.md). Frontend/E6 fuera de alcance. Pruebas solo proyecto aislado llaveextra-e5, sin migrar base principal.
