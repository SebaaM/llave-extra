# Contexto y decisiones

## Etapa administrativa autorizada — 24/10/2026

El usuario aprobó implementar un panel React completo integrado al sitio y su configuración, con orquestación de subagentes y revisores independientes. Diseño y plan en `docs/superpowers/specs/2026-10-24-panel-admin-design.md` y `docs/superpowers/plans/2026-10-24-panel-admin.md`; rama `feature/panel-admin`, dependiente de E5/PR #11 y #10 abiertos y sin fusionar en la última consulta. `/gestion` está implementado con gestión operativa y cuatro grupos de configuración; `/admin/` conserva el acceso técnico independiente. Corte de producto `2c4f40c`: revisiones por tarea aprobadas, 266 pruebas backend PostgreSQL/Redis, 100 de interfaz, 1 de proxy y 5 integradas con API real. Migraciones administrativas locales aplicadas con respaldo y conteos conservados, sin semillas. Quedan revisión final de rama, observaciones menores y PR/CI; los clics nativos tienen una limitación de herramienta documentada. Ver `docs/verification/09-panel-admin.md`, su checklist en español y `docs/panel-administracion.md`. Analíticas E6 y UI de compra del Cliente siguen pendientes. Las pausas administrativas históricas siguientes no impiden esta etapa expresamente autorizada.

Estado vigente al 24/10/2026: E5 backend/API/Django Admin entregado en [PR #11](https://github.com/SebaaM/llave-extra/pull/11), rama `feature/tienda-pagos` contra `develop`, sin fusionar y dependiente de #10. Producto `4c9a402` aprobado por revisión independiente y focal; 213 pruebas PostgreSQL/Redis y QA HTTP completos. Migraciones shop0001–0005 aplicadas al entorno local conservando los conteos previos. CI de producto aprobado; HEAD vigente en las comprobaciones del PR. Detenerse antes de E6 y la UI de tienda F3. Mercado Pago operativo permanece deshabilitado hasta sandbox. Los apartados siguientes conservan el historial de entregas y estados intermedios; evidencia vigente en `docs/verification/05-tienda-pagos.md`.

## Objetivo

Captar registros de turistas y verificar consumos en la red para otorgar beneficios, progreso y créditos canjeables por regalería 3D. Corrección aprobada el 19/10/2026: catálogo general público configurable desde backoffice; carpetas y recomendaciones del colaborador privadas por QR. Ver `docs/plans/07-catalogo-publico-spec.md` y su plan de implementación.

## Cuatro roles y prioridad de producto

- **Cliente (`TOURIST`):** usuario principal; se registra, accede por QR a recomendaciones privadas, consulta y consume beneficios, y administra su progreso, créditos, compras y canjes propios. `TOURIST` es el identificador técnico existente, no un quinto rol.
- **Colaborador (`COLLABORATOR`):** refiere clientes mediante su QR único. Corrección más reciente: puede agregar/quitar en su propia carpeta beneficios concretos del catálogo; solo se muestra el elegido, no otras ofertas del mismo negocio. El administrador controla habilitación, QR y configuración. No modifica ofertas.
- **Prestador (`PROVIDER`):** usuario que administra un único negocio amigo, su propuesta, imágenes y ofertas mediante las reglas de revisión de publicación existentes. El administrador asigna ese negocio.
- **Administrador (`ADMIN`):** gestiona usuarios, habilitaciones, prestadores, carpetas, QR, reglas, pedidos y auditoría.

Un cliente puede acceder a más de una carpeta después de escanear sus respectivos QR. Un consumo referido conserva el colaborador que originó esa referencia; un consumo directo permite colaborador nulo, confirmado por el usuario el 19/10/2026. Deshabilitar o rotar el QR revoca esa referencia, sin eliminar el historial transaccional. El registro público crea solo `TOURIST` y no permite autoasignar privilegios.

## Reglas aprobadas

- Email y contraseña; verificar email antes de acreditar consumos o canjear.
- QR del prestador y PIN fijo independiente del login. QR de colaborador y QR de prestador tienen finalidades diferentes.
- Una acreditación por turista/prestador durante todo el programa, respaldada por una restricción PostgreSQL.
- 1.000 créditos globales iniciales; administrador configura base y valores por prestador. Conservar valor y regla histórica.
- Meta inicial de cinco consumos válidos, editable; gastar créditos no borra visitas. Sin premio extra automático por completar la barra.
- Créditos sin vencimiento en MVP; extensión futura prospectiva.
- Anulaciones con saldo insuficiente bloquean canjes y generan revisión administrativa, sin saldo negativo automático.
- Tienda en ARS: Mercado Pago o créditos, sin pagos mixtos; retiro en un punto configurable; cancelación por solicitud y revisión.

## Arquitectura

Monorepo: `backend/`, `frontend/`, `scripts/`, `docs/`. Django 5.2 LTS/Python 3.13 y PostgreSQL 17. API versionada y OpenAPI. React/TypeScript/Tailwind. Docker Compose local con Mailpit y Redis para límites compartidos; no hay worker de correo.

## Estado

Pedido posterior aprobado: adelantar F3 operativo con dashboards Prestador/Colaborador y barra lateral; analíticas y tienda siguen pendientes, Admin conserva Django Admin. El plan [08](docs/plans/08-backoffice-red.md) y su spec incorporan selección por beneficio y unicidad de negocio por usuario, prevaleciendo sobre descripciones históricas de carpetas por prestador. Producto implementado y revisión independiente aprobada en `2405cae`, rama `feature/backoffice-red`, base revisada `95b9953` dependiente del PR #9 todavía sin fusionar. Entrega en [PR #10](https://github.com/SebaaM/llave-extra/pull/10) contra develop, sin fusionar; CI del producto/documentación `bc36bc0` aprobado, estado del HEAD vigente en las comprobaciones del PR.

Task 1 del plan 08 implementa el backend: `FolderBenefit` canónico en consultas privadas, red y consumo referido; `FolderProvider` conserva historia sin autorización y queda de solo lectura en Admin. La migración 0006 toma únicamente las ofertas publicadas/vigentes de negocios publicados en ese instante y detiene la ejecución ante usuarios con varios negocios; no se heredan ofertas futuras. API propia del Colaborador para seleccionar/quitar, selector privado independiente del interruptor público, QR PNG propio del Prestador, conflicto de borrado protegido y marca demo heredada del negocio en altas. Las migraciones de esta tarea solo se validan en PostgreSQL de pruebas; la base principal queda pendiente de revisión y aplicación por el orquestador. Dashboards React y QA de interfaz pertenecen a Task 2.

E0: documentación inicial. E1: base reproducible entregada. E2: autenticación, sesiones revocables y acceso privado por QR, con proxy de desarrollo que sanea cabeceras de cliente. E3: prestadores, ofertas y carpetas implementados y revisados en `f28e9cb`. E4: consumos únicos por Cliente/Prestador, QR+PIN, créditos, progreso y anulaciones con ajustes pendientes; ver `docs/plans/04-consumos-creditos.md`. F2 conecta Beneficios y Pasaporte en Mi viaje con E2–E4. F1 fue una etapa histórica de elección: sus prototipos y rutas se retiraron del producto en el plan 07.

El registro crea solo `TOURIST`. E5 (tienda/pagos), E6 (analítica/operación) y el resto de F3 siguen pendientes; los paneles operativos se adelantaron por pedido explícito en el plan 08. Task 8 migró las herramientas a uv/pnpm. Desde el plan 07 se usa GitFlow con `develop` de integración y `feature/*` para cambios; los PR históricos apilados se conservan. No fusionar PRs desde este trabajo.

Toolchain aprobada: Python 3.13.16 con uv 0.11.3 en `backend/pyproject.toml` y `backend/uv.lock`; Node 24.19.0 con pnpm 11.22.0 en `frontend/package.json` y `frontend/pnpm-lock.yaml`. Docker Compose sigue siendo el arranque predeterminado; uv nativo es opcional para el IDE y las herramientas locales.

Corrección Task 1: el acceso local a `/admin/` y `/static/admin/` se enruta de Vite a Django; el backoffice conserva su sesión y CSRF independientes del JWT de la API. Task 2 incorpora catálogo general público de beneficios publicados y vigentes, con interruptor singleton en Admin y medios revalidados por solicitud; carpetas QR siguen privadas. Task 3 permite consumo directo con colaborador nulo, conserva referencia estricta cuando se aporta y exige beneficio publicado/vigente para acreditar, independientemente del interruptor público. El retiro de prototipos se completó en Task 4 del plan 07.

Task 5 agrega contrato de red visual para catálogo y carpetas: configuración de presentación general y por colaborador, paginación por prestadores únicos con oferta vigente y autorización privada por carpeta renovada en cada solicitud. Task 4 consume ese contrato con red de fondo/tablero fijos y nodos paginados; `/beneficios` es catálogo general público, `/recomendaciones` usa carpeta QR privada, `/consumo` ofrece modo directo y referido. Se retiró F1 del producto, con su documentación histórica conservada. Medios comerciales demo aprobados se cargan en storage privado con `seed_demo_media` (solo DEBUG/campos vacíos); fotografías de ciudad y créditos en `docs/assets.md`. Ver contrato en `docs/api.md` y plan en `docs/plans/07-catalogo-publico-gitflow.md`.

Task 6 de la corrección del catálogo traduce la navegación y metadatos visibles del backoffice Django a español. Los nombres técnicos, roles almacenados, permisos, endpoints y operaciones financieras se preservan; `TOURIST` se muestra como Cliente. QA real confirmó el índice, el listado de Prestadores y el formulario de un prestador. Las cuatro migraciones de presentación se comprobaron sin SQL de tablas o columnas y se aplicaron al entorno local. La evidencia de esta corrección se conserva en `docs/verification/07-catalogo-publico.md`.

Entrega de la corrección en el PR #9 contra `develop`, sin fusionar. La revisión independiente de rama quedó aprobada después de separar foco y hover en la pausa automática de la red (`2dd1c7e`). La suite frontend final pasó 32/32 más proxy 1/1; el backend conserva 82/82 sobre PostgreSQL/Redis. El estado de CI vigente se consulta en las comprobaciones del PR. Al cerrar esta entrega se detiene el trabajo antes de E5/E6/F3.

Plan 08: `FolderBenefit` es autoridad de selección concreta; `FolderProvider` conserva historia administrativa readonly. La migración 0006 tomó solo beneficios publicados/vigentes al ejecutarse, sin herencia de futuras ofertas. PostgreSQL limita a un negocio por usuario Prestador, permite varios usuarios de un mismo negocio y rechaza duplicados previos sin resolverlos silenciosamente. Agregar/quitar selecciones y acreditar comparten orden de locks; el borrado masivo usa un snapshot único para evitar deadlocks.

Los paneles `/prestador` y `/colaborador` tienen barra lateral, gestión operativa propia, medios/QR privados y cuenta/salida; Admin continúa en `/admin/` con sesión independiente. Los rechazos 401/403 de listas, escrituras, medios y credenciales cierran los contenedores privados y desmontan el PIN; un 404 de imagen conserva la vista alternativa. El transporte multipart mantiene refresh, cancelación y aislamiento de sesión. El uso de referencias está reservado a Cliente; portada/catálogo/auth siguen accesibles a otros roles.

Verificación final de CI: backend 97 pruebas PostgreSQL/Redis, Ruff y migraciones sin cambios; frontend 78/78 UI y proxy 1/1, lint/tipos/build y auditoría sin vulnerabilidades conocidas. También se ejecutó la suite frontend completa desde el orquestador. Revisión completa y focal final aprobadas sin hallazgos de producto pendientes. Migración local aplicada; conserva diez asociaciones históricas, ocho selecciones y once beneficios públicos demo. QA real de ambos roles y 320 px, login ADMIN hacia Django, alta/edición de borrador sintético y agregado/quita de selección propia. Subida de imagen manual no declarada end-to-end por límite del selector del controlador; cobertura multipart y medios automatizada. Evidencia durable en `docs/verification/08-backoffice-red.md`. Etapa entregada en PR #10; detenerse antes de E5/E6, sin fusionar PRs.

## Inicio de E5 — 20/10/2026

El pedido vigente autoriza arrancar tienda/pagos y revoca la pausa anterior. Se implementan backend/API/Admin según docs/plans/05-tienda-pagos-spec.md y docs/plans/05-tienda-pagos.md, en feature/tienda-pagos desde 9f8f56d (PR #10 revisado, todavía sin fusionar). Frontend de tienda y E6 esperan su etapa. Sin cobros reales; validación sandbox externa pendiente. Estado y resultados finales se registrarán al cerrar E5.


## E5 Task 1 — implementación local del 23/10/2026

Se agregó dominio/API/Admin de tienda: catálogo público independiente, canjes atómicos E4, stock delta auditado, snapshots y claves protegidos en PostgreSQL, pedidos propios y cancelación de créditos. MONEY solo reserva 15 minutos y crea outbox durable sin HTTP; proveedor predeterminado disabled, fake permitido únicamente en desarrollo/pruebas, mercadopago cerrado hasta Task 2. Cancelación monetaria y worker/vencimiento pendientes de Task 2. Retiro requiere configuración administrativa. Contrato en docs/api.md; comprobaciones de esta tarea en docs/verification/05-tienda-pagos-task-1.md. Migraciones ejecutadas solo en BD PostgreSQL de pruebas del proyecto aislado llaveextra-e5; base principal sin modificar. Task 1 queda a revisión independiente; E5 no está terminada ni se validó Mercado Pago real. Frontend sin cambios.

## E5 Task 2 — implementación local del 24/10/2026

Task 1 `a7a6b59` pasó gate independiente sin hallazgos. Task 2 incorpora adaptador Orders con configuración explícita, fake durable DEMO, outbox/inbox recuperables, búsqueda por referencia, vencimiento, cancelación monetaria y refund confirmado exclusivamente por GET. Contratos HTTP/seller congelados y guardados en PostgreSQL; leases y versión global del pedido descartan respuestas antiguas. Se reconcilian pedidos pagados/preparados y terminales; refund tras entrega conserva stock/estado físico y audita incidencia. Admin opera revisión/refund/reintento con motivo, sin edición de historia ni confirmación monetaria manual. Seeds y comandos documentados en docs/shop-operations.md; evidencia en docs/verification/05-tienda-pagos.md. Suite completa 196 pruebas PG/Redis, Ruff, migraciones sin drift y OpenAPI sin warnings. Verificación solo proyecto aislado, sin modificar base/cuentas principal ni ejecutar cobros externos. Gate independiente T2, PR/CI y sandbox pendientes; frontend de tienda/E6 fuera de alcance.

Corrección I1 del gate final E5: PAYMENT_REVIEW ya distingue reserva impaga de stock previamente acreditado mediante Order.payment_confirmed monotónica. Reservas impagas sin refund vencen/cancelan una vez con o sin ID remoto; PAID/READY históricos y REFUND_PENDING retienen stock hasta GET de reintegro. Nueva migración 0005 reconstruye marca desde estados/auditorías sin editar 0001–0004; claves, fencing y recuperación tardía se conservan. Regresiones y verificación en docs/verification/05-tienda-pagos.md; re-review focal y aplicación a QA existente por el orquestador pendientes de cierre. Base principal intacta.

## Cierre E5 — 24/10/2026

Gate Task 2/rama aprobado en 4c9a402 tras corregir I1, sin hallazgos restantes. payment_confirmed conserva la evidencia histórica del pago: reserva impaga vence/cancela; stock previamente acreditado y refund pendiente se retienen hasta confirmación. Upgrade 0004→0005 y QA HTTP post-fix aprobados.

En el entorno local se aplicaron solo migraciones, sin seed ni rotación de cuentas/QR. Se conservaron 17 usuarios, 14 prestadores, 14 beneficios, 10 asociaciones históricas, 8 selecciones, 6 consumos y 7 movimientos de billetera. La tienda local queda sin productos/pedidos; los escenarios DEMO están separados en llaveextra-e5, con guía docs/shop-operations.md. Backend8000, frontend5173 y Admin por proxy iniciados y HTTP200. E6, UI de tienda y sandbox externo siguen pendientes.
