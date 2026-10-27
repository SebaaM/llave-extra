# Auditoría de seguridad de Llave Extra — plan de implementación y ejecución

> **Para agentes ejecutores:** usar `superpowers:subagent-driven-development` para la implementación de correcciones, con el orquestador como único creador de agentes y revisores independientes. Los pasos `- [ ]` registran trabajo todavía no ejecutado.

**Objetivo:** recorrer cada feature/task implementada, probar su seguridad y corregir hallazgos reproducidos mediante subagentes, con trazabilidad completa.

**Arquitectura:** auditor con acceso al código y pruebas HTTP reales sobre un proyecto Docker aislado. El orquestador mantiene cobertura y hallazgos; delega fixes acotados y exige revisión independiente antes de cerrarlos.

**Stack:** Django/DRF, PostgreSQL, Redis, React/TypeScript/Tailwind, Docker Compose; Python 3.13.16/uv 0.11.3 y Node 24.19.0/pnpm 11.22.0 fijados por el repositorio.

**Spec:** [diseño y alcance](../specs/2026-10-24-auditoria-seguridad-design.md).

**Estado:** plan preparado el 24/10/2026; auditoría y correcciones no iniciadas. `continua con el plan` mantiene el trabajo documental. No se crea un servicio productivo ni una automatización recurrente.

## Restricciones globales

- Leer AGENTS/contexto/roadmap y specs actuales; prevalecen las correcciones recientes de roles/catálogo/selección concreta y tienda.
- PostgreSQL real para dominio, transacciones e integración. Sin SQLite ni validación financiera basada solo en mocks.
- Docker aislado y datos sintéticos; QA HTTP con settings locales, nunca con el hasher simplificado de tests. Sin tocar entornos existentes.
- Las cuatro funciones de agentes son responsabilidades; solo el orquestador hace dispatch. Implementadores no crean subagentes ni revisores.
- GitFlow: `feature/*` para campaña/fixes sobre la base acordada, PR a `develop`; dependencias apiladas explícitas si la base aún no está integrada. No fusionar, reescribir historia ni hacer force push. Commits Conventional Commits en español, verificando antes de cada uno.
- No guardar secretos ni datos reales en documentos, tests, reportes o CI. Mantener `.env-example` vacío; no leer/volcar `.env` de otros entornos.
- Ajustar `docs/api.md` y el esquema OpenAPI solo si la corrección cambia el contrato; conservar roles y nombres técnicos. Backoffice en español.
- HTTP externo fuera de transacciones. Mercado Pago real permanece bloqueado; `fake` solo desarrollo/pruebas y no acredita interoperabilidad.
- E6/F3 y tareas aún no implementadas se inventarían como pendientes. No implementarlas para poder marcarlas auditadas.

## Focos de revisión

1. Usuario activo o sesión válida que pierde habilitación, asignación o selección mientras otra operación está en curso: revocación real y orden de locks, Tasks 3/4.
2. Reintentos y doble envío con igual clave/carga distinta, desde otro usuario o con orden cambiado: sin doble efecto ni fuga de respuesta, Tasks 3/4.
3. Entradas Unicode, UUID/JSON corruptos, cuerpos/tokens largos y encabezados duplicados: rechazo controlado sin 500, bypass o datos privados, Tasks 3/4.
4. Pagos tardíos, GET obsoleto, revisión impaga con ID remoto y refund tras entrega: conservar evidencias, dinero e inventario, Task 4.
5. Logout/cambio de usuario/múltiples pestañas con respuestas y blobs en vuelo: no restaurar sesión vieja ni mostrar datos previos, Tasks 3/5.

## Archivos y responsabilidades

| Archivo | Responsabilidad |
|---|---|
| `docs/security/checklist.md` | Lista inicial, estado actual y vínculos a casos/evidencia |
| `docs/security/hallazgos.md` | Registro de hallazgos, severidad, solución y validación independiente |
| `docs/security/prompt-auditor.md` | Instrucción reutilizable para iniciar y retomar la campaña |
| `docs/security/inventario.md` (Task 1) | Tasks/features presentes, endpoints/métodos, actores, objetos y controles aplicables |
| `docs/security/runs/<run-id>/resumen.md` (Task 1+) | Corte, entorno, comandos/resultados, cobertura y limitaciones de una corrida |
| `docs/security/runs/<run-id>/casos.md` (Task 3+) | Matriz detallada y evidencia saneada por caso, incluidos negativos |
| `docs/security/runs/<run-id>/agentes/<asignacion-id>.md` (Task 4+) | Hallazgo/archivos asignados, resultado, dudas, revisión y commit |
| `docs/security/laboratorio.md` (Task 2) | Receta versionada para regenerar Compose, fixtures y variables, sin valores secretos |
| `work/security/compose.audit.yaml`, `work/security/audit.env` (Task 2, ignorados) | Entorno local aislado; nunca fuente de credenciales versionada |
| Tests existentes por dominio; tests nuevos focales cuando falten (Tasks 3–5) | Reproducción del fallo y regresión permanente |
| `CONTEXT.md`, `ToDo.md`, `docs/plans/00-roadmap.md` | Estado resumido y enlace al registro, sin duplicar evidencia |

`run-id` propuesto: `YYYYMMDD-HHMM-<sha7>`, usando hora Argentina con zona/offset explícito. Cada evidencia registra SHA y, si hay cambios sin commit, diff/hash de esos cambios. Un SHA solo no describe un árbol sucio.

## Task 1: Fijar corte e inventariar la superficie completa

**Archivos:** crear inventario y resumen de corrida; ampliar checklist sin cambiar sus IDs. Leer `.github/workflows/ci.yml`, todos los `urls.py`, views/serializers/permisos, Admin, comandos y rutas React.

**Interfaces:** consume docs del proyecto y código del corte; produce `feature_id`, `control_id`, `case_id`, lista `método + ruta + actor + relación con objeto`, política esperada y fuente. Casos con métodos no soportados verifican 405 y ausencia de efectos.

- [ ] Registrar `git status --short`, rama, SHA y cambios locales; identificar qué pertenece a otra tarea. Si hay implementación concurrente, usar una copia/worktree del corte acordado y no mover el checkout activo. No crear ramas desde un árbol sucio trasladando cambios ajenos.
- [ ] Reconciliar roadmap, ToDo, specs, evidencia y código real. Inventariar E1, E2, E3, E4, E5, F2, Task 8 (herramientas/CI), correcciones 07/08 y panel Admin presente. Marcar lo no implementado y comprobar retiro de F1 y otras funcionalidades retiradas.
- [ ] Enumerar URL resolver Django, OpenAPI y rutas React; comparar diferencias. Incluir `/admin/`, medios, QR PNG, salud, schema/docs, configuración pública, webhooks y management commands, aunque no estén en OpenAPI.
- [ ] Para cada feature describir datos sensibles, actores permitidos, operaciones y abuso posible; mapear requisitos aplicables de ASVS 5.0.0, WSTG 4.2/API Top10 y reglas locales. Completar o justificar cada requisito ASVS L2 seleccionado; no presentar el conjunto inicial como certificación.
- [ ] Construir matriz: anónimo, Cliente activo verificado/no verificado/inactivo, Colaborador propio/ajeno/deshabilitado, Prestador propio/ajeno/sin negocio, Admin completo y combinaciones parciales de rol/flags. Añadir dos clientes, dos carpetas y dos negocios para accesos cruzados.
- [ ] Cruzar cada control aplicable con métodos, endpoints y variantes. Un control agrupado solo pasa cuando todos sus casos aplicables pasan. GET/HEAD/OPTIONS, POST/PUT/PATCH/DELETE y rutas alternativas se comparan según el contrato.
- [ ] Revisión del inventario por agente independiente asignado por orquestador; registrar omisiones resueltas. Verificar cobertura bidireccional: toda feature presente tiene controles y todo endpoint tiene política y casos.

**Entrega comprobable:** inventario con corte y procedencia, cero endpoints presentes sin clasificar; los no implementados no cuentan como auditados. Commit documental solo después de verificar enlaces/diff y sin incluir cambios ajenos.

## Task 2: Preparar laboratorio reproducible y línea base

**Archivos:** Compose/env ignorados en `work/security/`; receta versionada en `docs/security/laboratorio.md`; helpers/fixtures reproducibles sin credenciales fijas dentro de tests existentes o archivos nuevos focales; resumen de corrida.

**Interfaces:** consume corte/matriz; produce objetivo local permitido, fixtures identificadas por alias, estado inicial y comandos reproducibles. Nombres sintéticos y contraseñas aleatorias se mantienen en el laboratorio; los reportes usan alias.

- [ ] Crear Compose independiente con PostgreSQL, Redis, Mailpit, backend y frontend construidos desde el corte, volúmenes/red nuevos y puertos loopback libres (propuestos 8002/5175/8027). No heredar `.env`, binds privados ni nombres externos de volumen. Registrar la versión de Compose y confirmar aislamiento sin volcar variables secretas.
- [ ] Documentar en `docs/security/laboratorio.md` la receta o plantilla saneada exacta para regenerar Compose, nombres de variables requeridas sin valores, imágenes/versiones, generación de claves, carga de fixtures y comandos. Probar reconstrucción desde esa receta antes de acreditar reproducibilidad; mantener los archivos efectivos y secretos efímeros ignorados.
- [ ] Generar claves independientes y credenciales efímeras en archivo ignorado, variables de entorno del laboratorio y `.gitignore` local apropiado. Comprobar con `git check-ignore` que ningún secreto pueda entrar en el commit.
- [ ] Construir imágenes con locks, iniciar servicios, migrar solo este proyecto y crear fixtures de roles/ownership. Preparar estados draft/publicado/vencido, selección presente/retirada, QR actual/rotado, saldos/stock y pedidos representativos.
- [ ] Correr suite existente y verificaciones de baseline. Fallos heredados se registran con reproducción; no se ocultan ni se atribuyen automáticamente al último cambio.
- [ ] Verificar HTTP real por proxy y backend directo: login/CSRF/cookie, email en Mailpit, `/me`, acceso permitido y denegado, descarga privada. Capturar solo datos saneados.
- [ ] Hacer prueba de identidad del entorno: PostgreSQL de laboratorio, namespace Redis propio, storage propio y pagos `disabled`. Escenarios fake separados explícitamente. Confirmar que el comando de tests no usa SQLite.

Comandos propuestos desde la raíz, **después de crear el Compose independiente**; todavía no ejecutados:

```powershell
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security build backend frontend
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security up -d db redis mailpit backend frontend
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T backend python manage.py migrate --noinput
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T backend ruff check .
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T backend python manage.py makemigrations --check --dry-run
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T backend python manage.py spectacular --validate --fail-on-warn --file /tmp/security-openapi.yaml
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T frontend pnpm run lint
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T frontend pnpm run typecheck
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T frontend pnpm run test
docker compose --env-file work/security/audit.env -f work/security/compose.audit.yaml -p llaveextra-security exec -T frontend pnpm run build
```

Esperado: todos exit 0; PostgreSQL/Redis confirmados; OpenAPI sin errores/warnings; suite sin fallas. El override de settings en pytest es obligatorio también en pruebas focales para no heredar el entorno local de QA; no cambia los settings del servidor. Registrar conteos reales y versión de imágenes; no copiar conteos históricos. Ante cambios de código, reconstruir los servicios afectados antes del QA HTTP.

## Task 3: Auditar identidad, permisos y privacidad

**Archivos de referencia/tests:** `backend/accounts/{authentication,security,views,serializers}.py`, `backend/accounts/tests/test_auth_api.py`, `backend/referrals/{access,views}.py`, `backend/referrals/tests/test_referrals.py`, `backend/providers/{access,recommendations,network,media,catalog_views}.py`, sus tests y `backend/administration/{permissions,views,commands,concurrency}.py`, `backend/administration/tests/test_settings.py`. React `frontend/src/product/api.test.tsx`, `PrivatePhoto.test.tsx`, `workspace/Workspace.test.tsx` y pruebas Admin que existan en el corte.

**Interfaces:** consume casos y fixtures de Tasks 1/2; produce evidencia por caso, controles ejecutados y hallazgos `SEC-NNN` reproducidos. La ausencia de hallazgos requiere evidencia positiva, no un informe vacío.

- [ ] Auditar registro/escalada por campos extra; autenticación, email/reset de uso único y propósito; inactivos; enumeración; límites Redis y su fallo; proxy/cabeceras manipuladas.
- [ ] Probar JWT firmado alterado, expirado, tipo/algoritmo incorrectos, sid ajeno/ausente, sesión revocada, cambio de contraseña y refresh replay/concurrente. Fijar aserciones sobre status, cookie y ausencia de nueva sesión/acceso.
- [ ] Probar CSRF en autenticación y Django Admin, flags/path de cookie en settings correspondientes, CORS/origin y separación sesión Django/bearer. No exigir JWT al webhook: tiene autenticación HMAC propia.
- [ ] Recorrer **cada endpoint/método** con roles y objetos propios/ajenos; cambiar UUID en path, query, body, listas anidadas, filtros, paginación, exportaciones/medios que existan. Rechazo debe evitar lectura/escritura y filtraciones de campos/contadores.
- [ ] Revalidar carpetas tras deshabilitar colaborador, rotar QR, retirar `FolderBenefit`, vencer/despublicar beneficio o prestador. Probar que historia `FolderProvider`/`FolderAccess` no autoriza y que publicar otra oferta no la hereda.
- [ ] Verificar que Prestador no reasigna titularidad/publicación/roles y Colaborador no modifica otra carpeta ni reglas. Probar bypass en Django Admin con `is_staff` y permisos parciales.
- [ ] Probar DTO público configurable sin datos de carpeta/QR/PIN/membresía; medios por URL antigua sin autorización y cache/control de errores. Separar interruptor público de autorización privada y consumo directo.
- [ ] Cada denegación comprueba status contractual, respuesta saneada y estado PostgreSQL/archivos/sesiones antes/después. Los errores 400/401/403/404/409/429 no se intercambian para hacer pasar pruebas.
- [ ] Delegar hallazgos reproducidos mediante Task 4 mientras el auditor continúa únicamente en áreas independientes.

**Entrega comprobable:** casos de identidad/autorización ejecutados sobre HTTP real y pruebas reproducibles; vacíos explícitos. No cerrar controles con mocks de permisos o UI solamente.

## Task 4: Auditar negocio transaccional y corregir hallazgos

**Archivos:** `backend/credits/{services,models,admin}.py`, `backend/credits/tests/test_credits.py`, `backend/shop/{services,models,admin}.py`, `backend/shop/payments/`, `backend/shop/tests/{test_shop,test_payments,test_reservations}.py`; pruebas administrativas y de selección según causa. Crear migraciones únicamente cuando la corrección las requiera, sin modificar migraciones históricas.

**Interfaces:** consume `SEC-NNN` y casos de Tasks 1–3; produce fix con regresión, commit, informe independiente y veredicto. Cada asignación especifica archivos permitidos y excluidos y dependencias de locks/contratos.

- [ ] Probar consumo directo/referido, QR/PIN, email activo/verificado, referencia inválida estricta y publicación/vigencia; unicidad vitalicia, snapshots/regla histórica y ausencia de confianza en importes del cliente.
- [ ] Probar carreras con conexiones PostgreSQL separadas y barreras, sin depender solo de sleeps: doble consumo, retiro de selección contra consumo, borrados Admin masivos, débitos simultáneos, último stock, cancelación/reintegro/entrega/expiración concurrentes. Verificar restricciones por escrituras directas controladas en la BD de tests.
- [ ] Probar tienda: dueño del pedido, precios/saldos/stock del servidor, idempotencia por actor y carga, ajustes delta/auditoría, snapshots inmutables, reserva y expiración, cancelación, estados y no doble reintegro.
- [ ] Probar webhook HMAC ausente/alterado/repetido/caducado/futuro, query duplicado y casing; cuerpo no autoritativo, GET concordante, seller/importe/moneda/referencia ajenos, timeouts, inbox temprano, outbox/reintento, CREATE incierto y fencing. Sin red externa.
- [ ] Probar regresiones críticas E5: `payment_confirmed` no retrocede, revisión impaga vence/cancela con/sin remoto, `expirable_orders` común, pagado/refund pendiente no libera por tiempo, pago tardío conserva recuperación, refund POST no repone y refund tras `PICKED_UP` solo audita incidencia financiera.
- [ ] Para cada hallazgo: confirmar reproducción y severidad/impacto; si es sospecha de scanner, registrar `POR_REPRODUCIR`, sin presentarla como vulnerabilidad confirmada.
- [ ] Orquestador asigna corrector nuevo con hallazgo, pasos, requisito vigente, archivos, prueba y riesgos. Agrupar misma causa; serializar áreas/locks compartidos. Auditor puede seguir donde no toque el diff.
- [ ] Corrector añade test específico, ejecuta RED y demuestra que falla por la vulnerabilidad, aplica fix mínimo, ejecuta GREEN y checks pertinentes. Si necesita cambiar regla de negocio, documenta ambigüedad y la eleva sin inventarla; continúa otros hallazgos.
- [ ] Revisor nuevo reproduce ataque y variantes, revisa diff y evidencia, ejecuta regresión en PostgreSQL/HTTP según caso. Puede rechazar; el orquestador devuelve la tarea al corrector y registra el ciclo.
- [ ] Orquestador integra solo cambios propios verificados, vuelve a ejecutar checks afectados y actualiza checklist/hallazgo. `CORREGIDO_PENDIENTE_REVISION` no equivale a `CERRADO`.

No introducir una batería especulativa de tests para cada línea: priorizar pruebas que demostrarían una violación real del control. Conservación RED/GREEN saneada y revisión independiente obligatorias para fixes de seguridad.

## Task 5: Auditar frontend, entradas e infraestructura del corte

**Archivos:** `frontend/src/product/`, `frontend/vite.config.ts`, `frontend/tests/proxy-config.test.mjs`, `backend/config/`, imágenes Docker, locks y CI. Registrar evidencia en corrida y fixes bajo Task 4.

**Interfaces:** consume APIs auditadas y la matriz; produce casos de navegador/HTTP, resultados de análisis automatizado y limitaciones de configuración/despliegue.

- [ ] Probar persistencia de tokens/QR/PIN en storage, URL, history, consola, referrer, errores y requests a terceros; revocación de object URLs y datos privados tras logout/cambio de usuario, múltiples pestañas y respuestas en vuelo.
- [ ] Probar XSS almacenado/reflejado/DOM en contenido editable y enlaces, esquemas URL peligrosos y redirecciones; SQL/ORM y filtros con entradas malformadas; multipart/JSON/cabeceras, tamaños e imágenes maliciosas/traversal. Sin cargas destructivas o agotamiento.
- [ ] Revisar host/proxy/cookies/CSRF/cache, medios privados fuera de storage público, settings producción y ausencia de credenciales/demo en build. Ejecutar `manage.py check --deploy --settings=config.settings.prod` con variables sintéticas apropiadas; registrar warnings y aplicabilidad. Verificar TLS/HSTS/CSP en servidor real solo si existe un objetivo desplegado autorizado; de lo contrario queda bloqueado, no aprobado.
- [ ] Revisar dependencias y secretos con herramientas disponibles: `pnpm audit --audit-level moderate`, análisis Python con `pip-audit` si se habilita una herramienta fijada y aislada, escáner de secretos con salida redactada y DAST autenticado opcional en allowlist local. Antes de instalar, fijar versión/configuración y registrar alcance; no agregar dependencias runtime de producto para la auditoría.
- [ ] Consultar fuentes primarias/advisories para hallazgos de dependencia, comprobar versión fijada y alcance explotable; sin subir código/secretos a servicios de escaneo. Fallo de red/feed se registra bloqueado, no limpio.
- [ ] Verificar que un crawler autenticado sigue autenticado con un control `/me`, y que recorrió rutas privadas previstas. Una pasada anónima o sin alertas no acredita cobertura autenticada.
- [ ] Registrar cada alerta reproducida con el mismo circuito de Task 4, distinguiendo falso positivo justificado, riesgo o bloqueo. No actualizar dependencias en masa sin relación con el hallazgo.

## Task 6: Cierre por evidencia y entrega

**Archivos:** registros canónicos, resumen final de corrida, contexto/ToDo/roadmap, contrato si cambió y PRs de fixes.

**Interfaces:** consume controles/casos/hallazgos/revisiones; produce informe final del corte y cola explícita de pendientes. El orquestador es dueño de la consistencia de IDs y conteos.

- [ ] Reconstruir servicios afectados y ejecutar suite backend completa PG/Redis, Ruff, drift/OpenAPI, y lint/tipos/tests/build frontend cuando corresponda; repetir QA HTTP/navegador de los flujos afectados sobre el corte final.
- [ ] Reviewer independiente revisa cobertura final y cambios de la campaña. Un fix en autenticación exige revalidar consumidores de sesión; un fix de autorización exige endpoints/medios hermanos; uno financiero exige invariantes y carreras relacionadas.
- [ ] Confirmar que todo endpoint/feature presente está mapeado y que todo caso tiene veredicto y evidencia del corte. Si cambió el código durante la campaña, invalidar y repetir casos afectados; el resto conserva fecha/versión explícita. Ejecutar smoke global final.
- [ ] Publicar conteos: aplicables, ejecutados, PASS, FAIL, bloqueados y no aplicables con motivo; hallazgos por severidad, abiertos y cerrados; pruebas realmente realizadas y límites externos. No contar bloqueados ni riesgos aceptados como PASS.
- [ ] Actualizar `CONTEXT.md`, `ToDo.md` y roadmap con un resumen y links, sin sobrescribir trabajo de otra sesión. Este trabajo no declara E6 completa.
- [ ] Antes de cada commit, verificar diff y comandos relevantes. PRs a `develop` con dependencias explícitas, descripción en español, evidencia y riesgos; adjuntarlos al chat y no fusionarlos. Consultar CI de ese HEAD si se publica.
- [ ] Entregar informe final. Con hallazgos abiertos, pruebas bloqueadas o requisitos sin ejecutar, estado `INCOMPLETA` o `CIERRE_CON_LIMITACIONES`, según corresponda; nunca «todo seguro».

**Cierre sin limitaciones:** todos los casos aplicables ejecutados y aprobados, hallazgos confirmados cerrados por revisión independiente y corte final verificado. Aceptación de riesgo solo por el usuario, con motivo/alcance/fecha de revisión; no la decide el agente ni elimina el hallazgo histórico.

## Reanudación y mantenimiento

Cada reanudación lee prompt, inventario, última corrida y hallazgos abiertos, compara SHA/diff y retoma pendientes sin resetear evidencia. Una nueva feature agrega casos; cambios en permisos/tokens/pagos invalidan los relacionados. No programar heartbeat ni monitor por este plan; primero completar una campaña reproducible.

## Autorrevisión documental

El plan cubre inventario exhaustivo (Task 1), aislamiento/baseline (2), identidad/permisos (3), negocio/corrección/revisión (4), navegador/entrada/configuración (5) y evidencia/entrega (6). Las cinco condiciones del foco tienen pasos asignados. Este documento no contiene pruebas ejecutadas ni afirma validación externa.
