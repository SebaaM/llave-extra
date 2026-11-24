# Plan de implementación — E6: analítica y preparación operativa

> **Para los agentes de implementación:** usar `superpowers:subagent-driven-development`. Ejecutar las tareas de a una por rama y registrar evidencia antes de marcar una casilla como completa. Este plan no autoriza por sí solo ni la implementación ni la publicación.

**Objetivo:** entregar métricas fiables y acotadas por rol, y demostrar en laboratorio la recuperación y reconciliación de Llave Extra.

**Arquitectura:** consultas DRF de solo lectura sobre PostgreSQL, con agregaciones en el servidor, ámbito derivado de la sesión y contratos pequeños. React reutiliza las superficies y controles de gestión. Los simulacros operativos usan Compose aislado y los comandos de dominio existentes; no hay un almacén analítico nuevo ni un despliegue productivo.

**Stack:** Django, DRF, PostgreSQL, Redis, React, TypeScript, Tailwind y Docker Compose. Base de diseño: `develop` en `7bb1a75`; comprobar la base vigente antes de abrir cada rama.

**Especificación:** [Diseño de E6](../superpowers/specs/2026-11-16-e6-analitica-operacion-design.md) · [Roadmap](00-roadmap.md#task-6-e6---analítica-y-preparación-operativa).

## Orquestación y orden de entrega

| Entrega | Unidades | Depende de | Evidencia para cerrar |
|---|---|---|---|
| E6.1 · Visitas atribuidas | T1 API, T2 panel | Base vigente | Informe verificado de extremo a extremo, con filtros y privacidad |
| E6.2 · Métricas por rol | T3 Prestador, T4 Colaborador, T5 créditos y tienda | Contratos de T1; llegada a la UI tras T2 | Totales conciliados con fuentes, alcance por rol y estados no disponibles honestos |
| E6.3 · Seguridad | T6 regresión y configuración | T1–T5 | Matriz de permisos y pruebas de entorno aislado, con pendientes externos separados |
| E6.4 · Operación | T7 restauración, T8 scheduler y traspaso | T6 para el cierre; el diseño de laboratorio puede adelantarse | Restauración verificada, reconciliación tras interrupción y runbook repetible |

- El orquestador dirige el trabajo y la integración. **Implementadores: `gpt-6-luna`, razonamiento `max`.** Un implementador por unidad, con archivos permitidos, contrato de entrada y pruebas explícitas. Si esa configuración no está disponible, no sustituirla silenciosamente. Para revisión independiente: `gpt-6.1-sol` con esfuerzo alto por defecto; usar un modelo de mayor juicio cuando haya cambios de permisos o recuperación de datos.
- El implementador no se aprueba a sí mismo. El revisor examina el diff exacto, los invariantes del dominio y la evidencia RED/GREEN; el orquestador vuelve a comprobar una prueba decisiva y registra el cierre. Los cambios compartidos (`Workspace.tsx`, rutas, OpenAPI y documentación común) tienen un único dueño. Se pueden preparar T3 y T4 en paralelo en worktrees separados después de T1, dejando la integración de navegación al orquestador.
- E6.1 parte directamente del `develop` remoto actualizado en `feature/e6-visitas-atribuidas`, en un checkout aislado. No modificar el `develop` local de trabajo. El orquestador integra los commits revisados de las ramas de funcionalidad en esa rama de entrega, sin reescribir historia publicada. Mantener código, pruebas y documentación relevante juntos en commits Conventional Commits en español, sin atribución de IA. Abrir el PR de E6.1 hacia `develop` para revisión humana, sin fusionarlo ni incluir etapas posteriores. Para nuevos cortes, partir del último límite ya revisado según [GitFlow](../gitflow.md); publicar o fusionar solo dentro de la autorización otorgada. El mínimo de cada entrega es una prueba propia, revisión independiente y verificación de CI si se publica.

## Restricciones comunes

- Mantener exactamente los cuatro roles actuales. `IsProgramAdmin` exige autenticación, usuario activo, rol `ADMIN`, `is_staff` e `is_superuser`. Prestador y Colaborador nunca eligen por parámetro qué negocio o perfil poseen; se resuelve en el servidor. El Cliente mantiene «Mi viaje» y su contrato propio.
- No cambiar contratos existentes de QR, consumo, créditos, comisiones o tienda; no ampliar acceso a carpetas ni medios. No devolver PII de Clientes, credenciales, CBU, QR, PIN, enlaces privados ni trazas de pago en analítica. Respuestas privadas sin caché compartida; UI desmonta datos al revocar la autorización.
- Separar personas, visitas, créditos y ARS. No incluir `fake`, DEMO, anuladas o reservas como visitas o ventas reales. No presentar cifras no verificables como cero. No habilitar compra, canje web, proveedor externo ni tareas sobre producción.
- Fechas civiles ISO `YYYY-MM-DD` en `America/Argentina/Ushuaia`: `[inicio del primer día, inicio del día posterior al último)`. Por defecto hoy y los 29 días previos. Rechazar filtros inválidos o invertidos y rangos mayores a 366 días civiles; aplicar cotas y orden estable a desgloses paginados.
- Sin datos reales, `.env` versionados, artefactos de respaldo en Git ni SQLite. Mantener `ToDo.md`, `CONTEXT.md`, el roadmap, la guía administrativa y API/OpenAPI en sincronía con cada entrega comprobada.

## Focos que debe cubrir la revisión

1. **T1:** una persona vinculada con dos colaboradores y dos versiones de QR se cuenta una vez en el total, no obtiene atribución nueva y no multiplica visitas por un `JOIN`.
2. **T2 y T6:** una respuesta tardía posterior a cambio de período, cierre de sesión o `403` no restaura los datos anteriores ni muestra una pantalla vacía como si el resultado fuera cero.
3. **T3 y T4:** reasignar un Prestador, deshabilitar un Colaborador o retirar una selección cambia solo la visibilidad que corresponde, sin perder historia de Administración ni alterar comisiones.
4. **T5:** un pago tardío confirmado sin evento fechado, una reserva y un refund pendiente no se convierten en ventas del período; los reintegros confirmados se muestran aparte, sin duplicar importes.
5. **T7 y T8:** un destino de restauración incorrecto se rechaza antes de escribir; después de una interrupción, el segundo ciclo no duplica stock, débitos ni reintegros y no vuelve a habilitar una sesión revocada.

## Comandos de verificación

Trabajar desde la raíz, en un checkout con `.env` exclusivamente sintético, ignorado y propio del laboratorio. Arrancar solo PostgreSQL y Redis de ese proyecto; `run --no-deps` no publica los puertos del servicio. Nunca usar el proyecto, volúmenes o `.env` de una instancia real. El ejemplo define `BE` como prefijo de comandos, no como una nueva dependencia del repositorio:

```powershell
docker compose -p llaveextra-e6 up -d --wait db redis
docker compose -p llaveextra-e6 build backend
$BE = @('compose','-p','llaveextra-e6','run','--rm','--no-deps','-e','DJANGO_SETTINGS_MODULE=config.settings.test','backend','/opt/venv/bin/python')
docker @BE -m pytest -q
docker compose -p llaveextra-e6 run --rm --no-deps backend /opt/venv/bin/ruff check .
docker @BE manage.py makemigrations --check --dry-run
docker @BE manage.py spectacular --file /tmp/schema.yaml --validate --fail-on-warn
```

En `frontend`: `pnpm install --frozen-lockfile`, `pnpm run test`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` y, donde esté autorizada la consulta al registro, `pnpm audit --audit-level moderate`. Después de cada prueba focal, ejecutar las comprobaciones correspondientes al área. Para UI, verificar 320 px, móvil, escritorio, teclado y zoom con datos sintéticos; guardar evidencia sin credenciales. Un comando fallido, omitido o pendiente se registra con su motivo.

## E6.1 — Visitas atribuidas para Administración

### T1 · API de visitas atribuidas

**Archivos:** crear `backend/analytics/__init__.py`, `periods.py`, `provenance.py`, `referrals.py` y `backend/analytics/tests/test_admin_visits.py`; crear `backend/administration/analytics.py`; modificar `backend/administration/urls.py` y `docs/api.md`. Los archivos sin directorio explícito en esta lista pertenecen a `backend/analytics/`.

**Interfaz:** `GET /api/v1/admin/analytics/visits/` acepta `from`, `to`, `collaborator_id` y `page` (25 comercios por página). Devuelve `period: { from, to, timezone }`, `linked_clients: { status: "available" | "unavailable", value: int | null }`, `valid_attributed_visits: int` y `businesses: { count, page, page_size, results }`, con filas `{ provider_id, provider_name, visits }`. Orden `-visits`, nombre y PK. La métrica global no depende de la página.

- [ ] Escribir `test_deduplicates_grants_and_keeps_historical_visits`: un Cliente vinculado a dos colaboradores y dos versiones del QR da `linked_clients.value == 1` sin filtro; dos visitas válidas a negocios distintos dan `valid_attributed_visits == 2`. Agregar una directa, una anulada, una DEMO, un límite de medianoche y un comercio despublicado con visita histórica. `test_legacy_demo_link_is_not_reported_as_real` espera `{"status":"unavailable","value":null}` para el indicador afectado y el resto sigue disponible. Probar fechas inválidas y el permiso por rol.
- [ ] Ejecutar RED: `docker @BE -m pytest -q analytics/tests/test_admin_visits.py`. Observar un fallo por el endpoint ausente y conservar la evidencia.
- [ ] Implementar `parse_period(query_params, *, today=None)` en `periods.py`; `attributed_visit_report(period, *, collaborator_id=None, page=1)` en `referrals.py`. Contar `FolderAccess` y `Consumption` en consultas independientes. Para procedencia, usar marcas verificadas: por ejemplo, `AdminAudit` `DEMO_ACTIVITY` de Clientes y marcas/snapshots de Prestador o beneficio. `credits-2026-10-18` señala una semilla histórica con `FolderAccess` directos sin marca individual: si su ventana no puede delimitarse de forma fiable, degradar el indicador antes que mostrar un total mixto. No usar email, nombre, archivos de accesos ni escribir metadatos históricos. Documentar cobertura y degradación de cada fuente, sin confundir diagnóstico con prueba de ausencia de DEMO.
- [ ] Ejecutar GREEN con el mismo comando; medir con datos sintéticos de tamaño representativo y registrar cantidad de consultas y `EXPLAIN`. Solo considerar índices con evidencia; si se necesitan, requieren una tarea revisable separada. Validar OpenAPI y guardar el contrato de T1 antes de delegar tareas dependientes.

### T2 · Informe de visitas en `/gestion`

**Archivos:** crear `frontend/src/product/admin/VisitAnalyticsPage.tsx` y `VisitAnalyticsPage.test.tsx`; modificar `frontend/src/product/admin/AdminWorkspace.tsx`, `frontend/src/product/admin/admin.css` si es necesario y `docs/panel-administracion.md`.

**Interfaz:** `/gestion/analitica/visitas` en «Créditos y visitas»; si se usa una sección raíz para el enrutador actual, registrar `analitica` como entrada de menú y abrir `visitas` como subruta. Los filtros aplicados se guardan en la URL. `VisitAnalyticsPage` consume el DTO T1 mediante `adminApi`; usar el listado administrativo existente para elegir al Colaborador. No alterar el Inicio operativo ni el resumen de la ficha.

- [ ] Escribir `it('aplica filtros y descarta la consulta anterior')` con dos respuestas fuera de orden, `it('distingue período vacío de dato no disponible')` con `0` frente a `null`, y `it('retira las métricas si se revoca el permiso')` tras `403`. La prueba de navegación verifica la ruta, filtro activo y reinicio de la página al hacer otra consulta.
- [ ] Ejecutar RED: `pnpm exec vitest run src/product/admin/VisitAnalyticsPage.test.tsx`.
- [ ] Implementar primero período y totales con definición, luego tabla semántica por comercio. Reutilizar controles existentes; mostrar «No disponible para este período» sin sustituir por cero, y un reintento para errores recuperables. Cancelar peticiones al cambiar filtros, navegación o sesión. Mantener foco visible y permitir lectura móvil sin desbordamiento de la página; sin nuevos gráficos ni cambio de identidad visual.
- [ ] Ejecutar GREEN y la suite de frontend. Probar período, selector, teclado, paginación, vacío y error en escritorio y móvil. Registrar la evidencia y cerrar E6.1 antes de considerar listo el informe.

## E6.2 — Métricas por rol, créditos y tienda

### T3 · Prestador: actividad del negocio asignado

**Archivos:** crear `backend/analytics/provider_views.py`, `backend/analytics/tests/test_provider_metrics.py`, `frontend/src/product/workspace/ProviderMetrics.tsx` y `frontend/src/product/workspace/ProviderMetrics.test.tsx`; modificar `frontend/src/product/workspace/ProviderWorkspace.tsx`. El orquestador es dueño de `backend/providers/urls.py` y `frontend/src/product/workspace/Workspace.tsx` para integrar rutas y navegación.

**Interfaz:** `GET /api/v1/provider/analytics/visits/` con período de T1; entrega `period`, `direct_visits`, `referred_visits` y `benefits: [{ benefit_id, benefit_title, visits }]` acotado a 25 filas más `other_benefit_visits`. `benefit_id: null` representa visitas **referidas** sin beneficio guardado. La UI de `/prestador` añade un bloque de resumen sin sustituir «Consumos referidos».

- [ ] Escribir `test_assigned_business_changes_scope_without_exposing_previous_data`: la cuenta cambia de negocio, la siguiente lectura vale solo para el nuevo negocio y no hay parámetros para suplantarlo. Sin asignación, responder `404`; rol inválido o cuenta inactiva, sin datos. Probar conteos directos/referidos, grupo sin beneficio y filtro DEMO. En UI, comprobar el retiro del bloque si se pierde el acceso.
- [ ] Ejecutar RED: `docker @BE -m pytest -q analytics/tests/test_provider_metrics.py` y `pnpm exec vitest run src/product/workspace/ProviderMetrics.test.tsx`.
- [ ] Implementar usando `ProviderMembership` y la política de `owned_provider`; no filtrar por la configuración pública del catálogo. Agregar desglose histórico con `Consumption.benefit_id` y `benefit_title`, nunca por la oferta vigente ni por identidad del Cliente. Reusar el período y componentes del panel.
- [ ] Ejecutar GREEN, verificar filtros y permiso desde el recorrido real del panel con fixtures. Confirmar que la pantalla existente de consumos no cambia.

### T4 · Colaborador: resultados de su propia red

**Archivos:** crear `backend/analytics/collaborator_views.py`, `backend/analytics/tests/test_collaborator_metrics.py`, `frontend/src/product/workspace/CollaboratorMetrics.tsx` y `frontend/src/product/workspace/CollaboratorMetrics.test.tsx`; modificar `frontend/src/product/workspace/CollaboratorWorkspace.tsx`. El orquestador integra cambios compartidos de rutas y navegación; no editarlos en paralelo.

**Interfaz:** `GET /api/v1/collaborator/analytics/visits/` con período de T1; entrega `period`, `linked_clients`, `valid_attributed_visits`, `businesses` (mismo formato paginado de T1) y `other_business_visits`. `/colaborador` muestra el resumen propio y enlaza a «Mis comisiones», sin mezclar sus importes.

- [ ] Escribir `test_removed_or_unpublished_business_is_aggregated_without_name`: retirar o despublicar un negocio conserva la visita en el total, pero la agrupa en `other_business_visits` y no serializa ni ID ni nombre. Probar perfil deshabilitado, otro Colaborador y acceso no concedido; comprobar que el comportamiento anterior del endpoint de comisiones permanece. En UI, probar monto no mezclado y dato que deja de estar disponible.
- [ ] Ejecutar RED: `docker @BE -m pytest -q analytics/tests/test_collaborator_metrics.py` y `pnpm exec vitest run src/product/workspace/CollaboratorMetrics.test.tsx`.
- [ ] Resolver el perfil activo/habilitado desde `request.user` en cada lectura. Reutilizar `selected_providers`/selección vigente y la elegibilidad de `FolderBenefit`; conservar la historia global del Administrador y las guardas de comisiones. Verificar `Mi viaje` del Cliente como regresión de navegación y contrato, sin añadirle una pantalla analítica.
- [ ] Ejecutar GREEN y releer los dos recorridos de rol después de unir el cambio de rutas. Confirmar que un fallo de una vista no carga datos de otro rol ni afecta los QR vigentes.

### T5 · Administración: lecturas de créditos y tienda

**Archivos:** crear `backend/analytics/finance.py`, `backend/analytics/tests/test_admin_finance.py`, `frontend/src/product/admin/FinanceAnalyticsPage.tsx` y `FinanceAnalyticsPage.test.tsx`; completar `backend/administration/analytics.py`, rutas, `AdminWorkspace.tsx`, OpenAPI y guía.

**Interfaz:** `GET /api/v1/admin/analytics/finance/` con `period`, `valid_visits: { direct, referred }`, `credits` (una propiedad por tipo de `WalletEntry`) y `shop: { credit_redemptions, confirmed_ars, refunded_ars, undated_confirmations_count }`. Cada cifra usa `{ status: "available", value: T }` o `{ status: "unavailable", value: null }`. El tipo `T` es entero para conteos y totales de créditos firmados; cadena decimal para sumas ARS. Las confirmaciones sin fecha se identifican como dato histórico no limitado al período; no se suman a ARS fechados. `/gestion/analitica/actividad` comparte el período sin desplazar «Comisiones» ni «Pedidos».

- [ ] Escribir `test_finance_counts_only_dated_authoritative_events`: un pago confiable con evento `PAID` agrega ARS una vez; `REFUNDED` agrega solo el reintegro a su fecha; un pago confirmado sin evento aparece solo en el contador sin fecha; estado pendiente y fake no suman. Probar `EARN`, `REVERSAL`, `REDEEM`, `REFUND` y ajuste firmado, un canje DEMO y un origen histórico no verificable. En UI, verificar que el formato y las etiquetas distinguen ARS, créditos y visitas.
- [ ] Ejecutar RED: `docker @BE -m pytest -q analytics/tests/test_admin_finance.py` y `pnpm exec vitest run src/product/admin/FinanceAnalyticsPage.test.tsx`.
- [ ] Implementar usando movimientos E4, pedidos y `OrderAudit` E5 (evento `PAID` y restitución total `REFUNDED` verificados). Contar canjes por pedido a partir de su fecha de adquisición y origen probado, no como ingresos. Elegir el primer evento verificable por pedido y tipo antes de aplicar el período; no volver a contar un duplicado posterior. Una incidencia financiera tras la entrega sin evento `REFUNDED` no es prueba de un reintegro fechado. No reconstruir fechas, incluir informes comerciales de comisiones ni agregar eventos nuevos. Documentar métricas y limitaciones en la UI y la API.
- [ ] Ejecutar GREEN y la suite. Comparar cada total con consultas de control y revisar ejemplos de crédito, pago y refund; cerrar E6.2 con pruebas de permisos de los cuatro roles.

## E6.3 — Seguridad y controles de publicación

### T6 · Matriz integrada de permisos, caché y proxy

**Archivos:** crear `backend/analytics/tests/test_security_boundary.py` y el esqueleto aislado `compose.e6.lab.yaml`; extender `frontend/src/product/ProductApp.test.tsx` para la pérdida de sesión y `VisitAnalyticsPage.test.tsx` para el informe; actualizar `docs/security/checklist.md`, `docs/security/hallazgos.md` si hay evidencia y `docs/verification/17-analitica-e6.md`. Corregir solo defectos reproducidos atribuibles a E6; abrir un seguimiento separado para lo ajeno.

- [ ] Escribir una matriz que afirme `401/403/404` según el contrato del endpoint, sin cuerpo analítico, para sesión ausente o revocada, Admin sin cada atributo exigido, roles cruzados, Prestador reasignado y Colaborador inhabilitado. Afirmar lista permitida de campos, política de caché privada/no-store y que el número de consultas por página no crece al multiplicar las filas. En frontend, retirar el panel al revocar acceso mientras una respuesta está en vuelo.
- [ ] Ejecutar `docker @BE -m pytest -q analytics/tests/test_security_boundary.py` y las pruebas E6 de Vitest; si hay un fallo, registrar RED antes de corregir, no fabricar un fallo en controles ya cubiertos.
- [ ] Validar Compose de laboratorio (TLS con certificado sintético, red interna, cabeceras, rechazo de acceso a medio privado y configuración Django). No asumir que este resultado comprueba DNS, certificado, SMTP ni cámara en dispositivos físicos. Conservar los controles pendientes con entorno, autorización necesaria y prueba de aceptación.
- [ ] Ejecutar la suite PostgreSQL/Redis, Ruff, drift, OpenAPI y la suite frontend. Registrar el resultado de cada fila y cerrar E6.3 sin mezclar seguridad comprobada con pendientes externos.

## E6.4 — Recuperación y reconciliación

### T7 · Simulacro de respaldo y restauración

**Archivos:** crear `docs/operations/e6-backup-restore.md` y `docs/verification/18-operacion-e6.md`; extender `compose.e6.lab.yaml` de T6. El Compose productivo se usa de referencia, no se ejecuta ni se modifica. Añadir una fixture mínima de laboratorio si las de integración no cubren todos los objetos.

- [ ] Escribir el checklist antes de ejecutar: origen y destino con identidades de proyecto distintas, destino vacío y prescindible, ninguna conexión externa. Una base que no corresponda al laboratorio y una copia con manifiesto incorrecto deben rechazarse antes de restaurar. Registrar el control negativo sin apuntar a un destino real.
- [ ] Ensayar en proyectos `llaveextra-e6-src` y `llaveextra-e6-restore`, con env/volúmenes propios y escritor detenido durante la toma consistente de PostgreSQL y medios. Guardar respaldo y sumas fuera de Git; restaurar sobre otro juego de volúmenes, verificar versión y lectura de datos. Inventariar Redis y no restaurarlo a ciegas: reiniciarlo no invalida una `AuthSession` recuperada desde una copia anterior a su revocación. Antes de abrir el servicio restaurado, invalidar las sesiones recuperadas mediante la política de recuperación, demostrada en laboratorio con una clave JWT sintética nueva (independiente de QR y cifrado de datos). Probar que tokens de una sesión revocada **después** de la copia no se aceptan y que un inicio nuevo funciona. No rotar claves reales ni exponer secretos en el runbook.
- [ ] Comparar conteos, saldos/libro, pedidos/comisiones y accesos a medios públicos/privados con las fixtures, incluidas autorización denegada y conservación de historia. Registrar duración, tamaño, comandos, resultado de rechazo y pasos de recuperación. No fijar RPO/RTO productivos sin el operador.

### T8 · Scheduler de laboratorio, reconciliación y traspaso

**Archivos:** ampliar `compose.e6.lab.yaml`; crear `backend/shop/management/commands/run_shop_scheduler_lab.py`, `backend/shop/tests/test_scheduler_lab.py` y `docs/operations/e6-handoff.md`; documentar la relación con `docs/shop-operations.md`. No cambiar el comportamiento de los tres comandos de producción existentes.

**Interfaz:** el scheduler de laboratorio solo puede ejecutarse con proveedor `fake` habilitado y entorno de pruebas aislado. Reutiliza `process_shop_outbox`, `expire_shop_orders` y `reconcile_shop_orders`, límites `1..1000`; una corrida `--once` de laboratorio permite probar el ciclo. Salida sanitizada con etapa, conteo, duración y resultado; sin payloads, tokens o referencias bancarias. Tratar diferencias de saldo/libro o comisiones como diagnósticos de solo lectura, no reparaciones.

- [ ] Escribir `test_scheduler_lab_rejects_non_fake_settings_before_any_worker` y `test_replay_after_interruption_does_not_duplicate_effects`: la denegación no llama a ningún comando; un segundo ciclo después de una operación simulada deja un solo efecto de stock/reintegro y conserva claves. Añadir caso de backlog/operación bloqueada y prueba de que el diagnóstico no escribe.
- [ ] Ejecutar RED: `docker @BE -m pytest -q shop/tests/test_scheduler_lab.py`.
- [ ] Implementar solo supervisión local, lotes, estado de última ejecución y recuperación, sin duplicar locks, fencing ni transiciones E5. Probar interrupción/reinicio con el fake y una muestra de operaciones bloqueadas. Documentar frecuencia inicial de 10 s para outbox y 1 min para vencimiento/reconciliación según el runbook, y cómo comprobar backlog sin reintentar en bucle.
- [ ] Ejecutar GREEN y el simulacro de extremo a extremo después de T7. Entregar checklist de operación con evidencias locales y, por separado, requisitos pendientes de TLS/SMTP público, dispositivos físicos, ubicación/retención del respaldo, objetivos de recuperación, scheduler real y sandbox oficial de pagos. No declarar producción lista ni habilitar compra/canje.

## Cierre por entrega

- [ ] Guardar comandos, resultados y límites en la evidencia; cruzar definiciones del informe con el contrato OpenAPI.
- [ ] Actualizar `ToDo.md`, `CONTEXT.md` y el roadmap solo con lo comprobado; documentar tareas externas como pendientes sin convertirlas en requisitos de una entrega local ya verificada.
- [ ] Confirmar que cada PR contiene solo su unidad o corte acordado y que no se modificaron el sitio actual, credenciales, roles, datos de producción ni reglas de dominio.
