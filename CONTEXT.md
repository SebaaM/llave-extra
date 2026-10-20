# Contexto y decisiones

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

Pedido posterior aprobado: adelantar F3 operativo con dashboards Prestador/Colaborador y barra lateral; analíticas y tienda siguen pendientes, Admin conserva Django Admin. El plan [08](docs/plans/08-backoffice-red.md) y su spec incorporan selección por beneficio y unicidad de negocio por usuario, prevaleciendo sobre descripciones históricas de carpetas por prestador. Implementación en `feature/backoffice-red`, base revisada `95b9953` dependiente del PR #9 todavía sin fusionar.

E0: documentación inicial. E1: base reproducible entregada. E2: autenticación, sesiones revocables y acceso privado por QR, con proxy de desarrollo que sanea cabeceras de cliente. E3: prestadores, ofertas y carpetas implementados y revisados en `f28e9cb`. E4: consumos únicos por Cliente/Prestador, QR+PIN, créditos, progreso y anulaciones con ajustes pendientes; ver `docs/plans/04-consumos-creditos.md`. F2 conecta Beneficios y Pasaporte en Mi viaje con E2–E4. F1 fue una etapa histórica de elección: sus prototipos y rutas se retiraron del producto en el plan 07.

El registro crea solo `TOURIST`. E5 (tienda/pagos), E6 (analítica/operación) y F3 (paneles completos) siguen pendientes; el orden posterior a esta corrección es E5→E6→F3. Task 8 migró las herramientas a uv/pnpm. Desde el plan 07 se usa GitFlow con `develop` de integración y `feature/*` para cambios; los PR históricos apilados se conservan. No fusionar PRs desde este trabajo.

Toolchain aprobada: Python 3.13.16 con uv 0.11.3 en `backend/pyproject.toml` y `backend/uv.lock`; Node 24.19.0 con pnpm 11.22.0 en `frontend/package.json` y `frontend/pnpm-lock.yaml`. Docker Compose sigue siendo el arranque predeterminado; uv nativo es opcional para el IDE y las herramientas locales.

Corrección Task 1: el acceso local a `/admin/` y `/static/admin/` se enruta de Vite a Django; el backoffice conserva su sesión y CSRF independientes del JWT de la API. Task 2 incorpora catálogo general público de beneficios publicados y vigentes, con interruptor singleton en Admin y medios revalidados por solicitud; carpetas QR siguen privadas. Task 3 permite consumo directo con colaborador nulo, conserva referencia estricta cuando se aporta y exige beneficio publicado/vigente para acreditar, independientemente del interruptor público. El retiro de prototipos se completó en Task 4 del plan 07.

Task 5 agrega contrato de red visual para catálogo y carpetas: configuración de presentación general y por colaborador, paginación por prestadores únicos con oferta vigente y autorización privada por carpeta renovada en cada solicitud. Task 4 consume ese contrato con red de fondo/tablero fijos y nodos paginados; `/beneficios` es catálogo general público, `/recomendaciones` usa carpeta QR privada, `/consumo` ofrece modo directo y referido. Se retiró F1 del producto, con su documentación histórica conservada. Medios comerciales demo aprobados se cargan en storage privado con `seed_demo_media` (solo DEBUG/campos vacíos); fotografías de ciudad y créditos en `docs/assets.md`. Ver contrato en `docs/api.md` y plan en `docs/plans/07-catalogo-publico-gitflow.md`.

Task 6 de la corrección del catálogo traduce la navegación y metadatos visibles del backoffice Django a español. Los nombres técnicos, roles almacenados, permisos, endpoints y operaciones financieras se preservan; `TOURIST` se muestra como Cliente. QA real confirmó el índice, el listado de Prestadores y el formulario de un prestador. Las cuatro migraciones de presentación se comprobaron sin SQL de tablas o columnas y se aplicaron al entorno local. La evidencia de esta corrección se conserva en `docs/verification/07-catalogo-publico.md`.

Entrega de la corrección en el PR #9 contra `develop`, sin fusionar. La revisión independiente de rama quedó aprobada después de separar foco y hover en la pausa automática de la red (`2dd1c7e`). La suite frontend final pasó 32/32 más proxy 1/1; el backend conserva 82/82 sobre PostgreSQL/Redis. El estado de CI vigente se consulta en las comprobaciones del PR. Al cerrar esta entrega se detiene el trabajo antes de E5/E6/F3.
