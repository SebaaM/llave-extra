# Instrucciones del proyecto

## Flujo de trabajo con agentes

Usar Superpowers en este repositorio. Las instrucciones globales de Gentle AI sobre ODD, registros `odd/` y revisión por recibos no se aplican a Llave Extra.

## Fuente de verdad

Leer `CONTEXT.md` y la etapa correspondiente de `docs/plans/00-roadmap.md` antes de implementar. La corrección más reciente del usuario sobre colaboradores/prestadores prevalece sobre el informe histórico.

## Restricciones

- Django + DRF, PostgreSQL, React + TypeScript + Tailwind; Docker local.
- Usuario por email antes de la primera migración. No usar SQLite para validar código del dominio o pruebas de integración.
- Carpetas y referencias privadas: autorización del servidor por QR válido, colaborador habilitado y prestador perteneciente a esa carpeta. Ocultar enlaces en React no satisface este requisito.
- Prestador y colaborador son roles diferentes. Solo un administrador habilita colaboradores, asigna el único negocio de cada usuario Prestador y configura las reglas de créditos. Corrección del usuario: el Colaborador habilitado puede agregar/quitar beneficios concretos del catálogo a su propia carpeta; no obtiene todas las ofertas del negocio. Ver `docs/plans/08-backoffice-red-spec.md`, que prevalece sobre la exclusividad histórica de asignación administrativa.
- Existen exactamente cuatro roles: Cliente (`TOURIST`, identificador técnico compatible), Colaborador (`COLLABORATOR`), Prestador (`PROVIDER`) y Administrador (`ADMIN`). El Cliente es la experiencia principal; el registro público crea solo `TOURIST` sin privilegios.
- La presentación del Cliente usa lenguaje cotidiano y el catálogo como vista habitual; no hay sección permanente ni enlace Recomendaciones en su menú. Al abrir el QR de un colaborador, después del login puede mostrar una selección contextual con su nombre y sus negocios/beneficios, sin copiarla a una colección del turista. Sí se registra el vínculo de ingreso para resumen del backoffice y se conserva atribución del consumo. Solo los colaboradores gestionan recomendaciones. Lecturas/medios y consumo directo/referido conservan validaciones del servidor; no trasladar contenidos privados al catálogo público. La ruta histórica `/recomendaciones` lleva a `/beneficios`. Navbar escritorio con enlaces visibles, barra móvil Beneficios/Mi viaje y red/lista automática; ver `docs/superpowers/specs/2026-10-30-seleccion-qr-contextual.md`.
- Consumos, créditos y stock requieren transacciones, restricciones de base de datos e idempotencia.
- No versionar credenciales, `.env`, códigos privados ni cuentas reales. `.env-example` contiene valores vacíos.
- Mantener `ToDo.md`, contexto, instrucciones y contrato OpenAPI alineados con cada funcionalidad.
- Catálogo general público de beneficios publicados/vigentes, configurable por administrador; carpetas y referencias siguen privadas. Ver `docs/plans/07-catalogo-publico-spec.md`, que prevalece sobre reglas históricas de catálogo privado.
- API de lectura del Cliente: categorías completas derivadas de la política pública vigente, sin inferirlas de una página parcial. El historial propio puede mostrar `provider_name` actual aun con catálogo apagado o comercio despublicado; no equivale a un snapshot histórico ni autoriza detalle, medios o carpetas. No agregar este campo al POST de consumo ni a sus resultados idempotentes persistidos por una mejora de presentación.
- `FolderBenefit` es la única selección canónica para listas, detalle, medios, red y consumo referido. `FolderProvider` conserva historia de solo lectura administrativa y no autoriza. Ninguna oferta futura se hereda automáticamente. Agregar/quitar selecciones bloquea perfil → prestador → beneficio, como E4; en borrados masivos Admin se bloquean primero todos los perfiles, luego todos los prestadores y beneficios. Los locks de perfil con `select_related(user)` usan PostgreSQL `of=("self",)` para evitar invertir User/perfil.
- E3 usa `referrals.access.active_folder_access(user, profile)` para recomendaciones privadas; E4 usa `referrals.access.locked_folder_access(user, profile_id)` si se aporta una referencia dentro de la transacción. El consumo directo permite colaborador nulo; una referencia inválida nunca degrada a directo. Ambos consumos exigen Prestador publicado con beneficio publicado/vigente, QR/PIN válido y Cliente activo con email verificado; el interruptor del catálogo solo afecta visibilidad pública. Ninguna etapa infiere acceso por existencia histórica de `FolderAccess`.
- La acreditación referida v2 exige elegir el beneficio de la carpeta junto al PIN único del negocio. El servidor revalida la oferta exacta y guarda su UUID y título históricos. Los reintentos exactos de v1 se recuperan después del corte. Las comisiones usan una ficha única por consumo referido elegible y una transferencia externa directa del Prestador al Colaborador. El Administrador supervisa y confirma la recepción. Los históricos sin beneficio y los registros demo quedan visibles con su estado y fuera de liquidación.
- Los datos bancarios del Colaborador se cifran con una clave de entorno independiente. La lectura ordinaria es enmascarada. La revelación administrativa exige ficha y motivo autorizados y queda auditada. Excluir CBU y alias de DTO del Prestador, replays, URLs y bitácoras.
- GitFlow obligatorio: main estable, develop integración, feature/*, release/* y hotfix/*. Commits Conventional Commits con descripción en español. No fusionar PRs. Ver `docs/gitflow.md`.
- Backoffice en español: definir nombres de aplicaciones/modelos/campos con `verbose_name`/`verbose_name_plural` y descripciones de columnas/acciones administrativas. Mantener identificadores de código, roles técnicos, tablas, campos y contratos API; las etiquetas de presentación no deben renombrarlos. El rol `TOURIST` se muestra como Cliente.
- Panel React en `/gestion`, API `/api/v1/admin/`: exigir usuario activo con rol `ADMIN`, `is_staff` e `is_superuser` en el servidor. `/admin/` conserva su sesión técnica independiente. El DTO público `/api/v1/site-settings/` expone únicamente textos/contactos de presentación; no filtrar configuración privada, QR, PIN ni historial por esa ruta. Las analíticas se implementan en otra etapa.
- Escrituras administrativas: comprobar versión vigente, incluir relaciones/credenciales relevantes de Prestador y Colaborador en su digest, usar comandos idempotentes y auditoría atómica para acciones. Un reintento incierto conserva clave y cuerpo originales; una acción nueva requiere ficha actualizada. Los GET no bloquean filas; las precondiciones se recalculan con los locks del dominio. No guardar secretos ni QR en resultados persistidos de comandos ni en almacenamiento del navegador.
- Tienda E5: locks User → Wallet → Order → Product ordenados por PK; usar servicios E4 para débito/reintegro y servicios `shop` para transiciones/ajustes delta. Snapshots, claves y cargas remotas están protegidos en PostgreSQL; no editar historia ni stock absoluto en Admin. `SHOP_PAYMENT_PROVIDER` arranca `disabled`; `fake` solo desarrollo/pruebas, prohibido en producción. HTTP siempre fuera de atomic; conservar claves/payloads ante timeout, usar GET autoritativo y fencing global por pedido. Refund POST no repone stock: requiere GET total concordante. PICKED_UP conserva inventario ante refund externo y audita incidencia. Inbox temprano/búsqueda por referencia recuperan CREATE incierto. Ver `docs/shop-operations.md`; sandbox externo pendiente.
- `Order.payment_confirmed` es monotónica: una revisión sin pago confirmado y sin refund conserva vencimiento/cancelación de reserva, tenga o no ID remoto. `expirable_orders` es el predicado común del batch y servicio. Nunca liberar por plazo stock antes acreditado o en refund pendiente; preservar claves, auditoría y recuperación de pagos tardíos.

## Verificación

Ejecutar comprobaciones relevantes antes de cada commit: pruebas de backend sobre PostgreSQL, lint, tipos y build del frontend según el cambio. Documentar el comando y resultado. No afirmar que una integración externa está validada si solo se probó un adaptador simulado.

## Herramientas del repositorio

- Backend: Python 3.13.16 y uv 0.11.3. `backend/pyproject.toml` y `backend/uv.lock` son la fuente única; el entorno nativo vive en `backend/.venv` (ignorado). En Docker uv instala con `--locked` en `/opt/venv`, fuera del montaje `backend:/app`.
- Frontend: Node 24.19.0 y pnpm 11.22.0. `frontend/package.json` declara `packageManager`, `pnpm-lock.yaml` es la fuente única y `pnpm-workspace.yaml` permite solo los scripts requeridos. Instalar con `pnpm install --frozen-lockfile`.
- Mantener `pnpm audit --audit-level moderate` activo en CI. El override temporal de minimatch en `frontend/pnpm-workspace.yaml` corrige GHSA-g3hv-75wg-m249; retirarlo solo cuando las dependencias ascendentes admitan versiones corregidas y se verifique el árbol bloqueado.
- Docker Compose es la opción local predeterminada y no requiere Python, uv ni Node en el host. Una ejecución nativa de Django requiere PostgreSQL, Redis, SMTP local y variables de entorno configuradas para servicios accesibles desde el host; no uses `db`, `redis` ni `mailpit` como hostname fuera de Docker.
- No montar entornos `.venv` ni `node_modules` del host en contenedores. No usar SQLite para validar el dominio.
- `seed_activity_demo` es manual, requiere DEBUG/PostgreSQL/fake explícito y usa namespace propio, checkpoints y servicios de dominio. No incorporarlo a `up`, migraciones o `seed_demo`; no vaciar la outbox global, editar historia financiera ni restablecer configuración/datos existentes. Conservar el archivo privado de accesos por base. Ver `docs/demo-activity.md`.

## Delegación

Los implementadores no crean otros subagentes ni sus propios revisores. El orquestador asigna trabajo acotado y revisores independientes. Usar modelos económicos para trabajo mecánico y un modelo de juicio adecuado para seguridad y concurrencia. Reportar dudas y hallazgos en archivos, sin duplicar historiales extensos.

## Flujo QR del Cliente — precisión vigente

El carrusel del hero muestra únicamente beneficios destacados por Administrador desde backoffice, sujetos a la política pública de publicación/vigencia y catálogo habilitado. La sección `/gestion/beneficios-destacados` lista todos los beneficios y permite seleccionar hasta cinco; PostgreSQL protege el límite. No seleccionar ofertas automáticamente ni usar las recomendaciones privadas como fuente del hero. Ver `docs/superpowers/specs/2026-11-01-destacados-hero.md`.

El catálogo de beneficios incluye «Cómo funciona», compartido con el inicio: visita confirmada, acreditación única por negocio y créditos destinados al canje en la tienda web. La UI actual de tienda aún no permite canjear; informar su disponibilidad real y no ofrecer una operación que no existe. Este contenido no requiere nuevas lecturas privadas.

El QR del colaborador es estable por perfil/versión; consultar, copiar, descargar o editar selección no lo renueva. La renovación propia es manual, con precondición, idempotencia y auditoría sin secretos. El consumo mantiene QR del negocio + PIN. La selección contextual no se copia al Cliente: la pista por pestaña admite solo IDs de cuenta/perfil, sin QR, URL, PIN ni nombre, y se revalida en servidor antes de usarse; no reconstruirla desde accesos históricos. El resumen acotado de clientes vinculados y visitas válidas atribuidas no equivale a E6 completa.
