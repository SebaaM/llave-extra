# Plan del panel administrativo React

Pedido aprobado el 24/10/2026: implementar `/gestion` y la configuración del sitio, con subagentes y revisión independiente. Las analíticas se incorporan en otra etapa. [Diseño](../specs/2026-10-24-panel-admin-design.md), [contrato API](../../api.md), [checklist](../../verification/09-panel-admin-checklist.md) y [evidencia](../../verification/09-panel-admin.md).

## Alcance y restricciones

Django/DRF, PostgreSQL/Redis y React/TypeScript/Tailwind del monorepo; Docker local y dependencias bloqueadas. No usar SQLite para verificar dominio. Respetar `AGENTS.md` y los servicios E4/E5.

- React `/gestion`, API `/api/v1/admin/`; servidor exige cuenta activa, rol `ADMIN`, `is_staff` e `is_superuser`. `/admin/` mantiene sesión técnica independiente.
- Cuatro roles; `TOURIST` se muestra como Cliente. El panel no asigna privilegios administrativos, cambia roles, verifica emails ni establece contraseñas de terceros. Las invitaciones reutilizan el restablecimiento existente, con envío pendiente/fallido explícito y sin worker nuevo.
- DTO público `/api/v1/site-settings/`: únicamente `site_name`, `home_title`, `home_description`, `footer_text`, `contact_email`, `whatsapp_url`, `instagram_url`. Texto plano y enlaces validados; sin secretos, configuración privada, QR ni historial.
- Selecciones concretas por `FolderBenefit`; `FolderProvider` no autoriza. Locks perfil → prestador → beneficio; perfiles con joins usan `of=("self",)`. Un usuario Prestador administra como máximo un negocio.
- Operaciones financieras por servicios E4/E5, con locks User → Wallet → Order → Product por PK. Historia y snapshots protegidos; stock por delta y motivo, sin edición de saldo absoluto. HTTP remoto fuera de atomic; pagos deshabilitados por defecto.
- Precondiciones HMAC detectan cambios del registro y relaciones/credenciales relevantes. GET sin locks; escrituras recalculan bajo locks del dominio. Versión obsoleta devuelve 409 sin descartar datos locales.
- Comandos idempotentes por actor/acción/clave, con fingerprint HMAC y auditoría atómica. Un reintento incierto conserva clave y carga; nueva acción requiere ficha actual. No persistir PIN, QR, tokens ni cuerpos remotos en respuestas, auditoría o almacenamiento del navegador.
- Limpiar contenido privado y respuestas tardías ante revocación/cambio de sesión. Medios y QR exigen autorización actual; liberar blobs.
- Rama `feature/panel-admin`, PR hacia `develop`, dependiente de #11/#10. Commits Conventional Commits en español; sin fusiones ni force push. Preservar trabajo ajeno y usar datos sintéticos aislados para QA.

## Tarea 1: Configuración y fundamentos

- [x] Implementar app `administration`, permisos, configuración, precondiciones, comandos y auditoría.
- [x] Exponer cuatro grupos con guardado independiente: General, Catálogo/red, Créditos y Tienda/retiro. Proveedor de pagos de solo lectura; conservar snapshots históricos.
- [x] Defaults sin escrituras en GET, validación estricta, DTO público limitado y errores saneados.
- [x] Probar permisos por rol/flags, conflictos, replay, rollback y concurrencia sobre PostgreSQL/Redis.
- [x] Aprobar revisión independiente y corrección de versiones malformadas.

## Tarea 2: Gestión operativa

Recursos: usuarios, prestadores, beneficios, colaboradores, consumos, billeteras, ajustes, productos, pedidos, cancelaciones, reglas de créditos, movimientos de stock y operaciones de pago. Sus campos, filtros y acciones exactos se mantienen en el contrato API.

- [x] Listas paginadas y detalles explícitos; alta/edición permitidas por recurso, sin mass assignment ni edición de historia.
- [x] Invitaciones, asignación de usuarios Prestador, PIN/QR, habilitación y selección de beneficios del Colaborador.
- [x] Consumos/créditos y acciones de tienda mediante servicios existentes; imágenes y QR privados dedicados.
- [x] Dashboard operativo con contadores y enlaces a filtros reales, bandejas y actividad; sin analíticas.
- [x] Probar permisos de acciones/medios, unicidad, versiones relacionadas, idempotencia, carreras y contrato OpenAPI; revisión independiente aprobada por tarea.

La lista de pedidos usa un resumen; el detalle conserva líneas, retiro e historia. La paginación independiente de historias extensas y selecciones se difiere y queda documentada como limitación de escala.

## Tarea 3: React e integración pública

- [x] Ingreso ADMIN y navegación a `/gestion`, menú lateral adaptable, teclado y presentación en español.
- [x] Búsqueda, filtros/página en URL, fichas, formularios, relaciones por nombre, acciones con confirmación/motivo y estados de carga/error/vacío reales.
- [x] Configuración con cuatro pestañas, vista previa de red y efectos reales en consumidores públicos; conservar logo e identidad visual.
- [x] Guardas de cambios locales, conflictos y recuperación de comandos inciertos sin repetir efectos; sesión y respuestas tardías protegidas.
- [x] Aprobar pruebas, lint, tipos, build y revisión independiente por tarea.
- [x] Cerrar la ola final conjunta: QR PNG, errores por campo, protección durante guardado y ajustes menores de uso; verificar regresiones y revisión focal.

## Tarea 4: Verificación y entrega

- [x] Migrar primero en QA aislado y verificar API real, roles y configuración con fixtures sintéticos.
- [x] Aplicar migraciones locales con respaldo previo y conteos conservados, sin semillas ni cambios de credenciales. Índice del respaldo comprobado; restauración no ensayada.
- [x] QA nativa de ingreso, dashboard/listas, guardado/restauración de General, portada pública, menú por teclado y filtro de stock a 320 px.
- [x] Complementar con componentes y HTTP real para configuración, edición, stock, decimales y QR PNG; distinguirlo de navegador nativo.
- [x] Ejecutar revisión integral de rama y asignar una única ola de correcciones.
- [x] Registrar comprobaciones del corte corregido y resultado de una revisión focal; no cerrar con fallos pendientes de seguridad/concurrencia.
- [x] Simplificar/revisar Markdown, actualizar contexto y pendientes y comprobar ausencia de información sensible y archivos temporales versionados. Commits propios por producto/documentación.
- [ ] Publicar PR a `develop`, consultar CI y adjuntar enlace; sin fusionar.

## Límites de aceptación

QA nativa pendiente para archivos, QR y confirmaciones sensibles: la herramienta detuvo el intento adicional y no se declara esa cobertura. Las suites y pruebas HTTP tienen su alcance documentado. Analíticas E6, compra/canje del Cliente, sandbox externo, scheduler y despliegue productivo permanecen fuera de esta entrega. Un adaptador simulado no valida el proveedor externo.
