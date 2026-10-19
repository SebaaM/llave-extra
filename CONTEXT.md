# Contexto y decisiones

## Objetivo

Captar registros de turistas y verificar consumos en la red para otorgar beneficios, progreso y créditos canjeables por regalería 3D. Corrección aprobada el 19/10/2026: catálogo general público configurable desde backoffice; carpetas y recomendaciones del colaborador privadas por QR. Ver `docs/plans/07-catalogo-publico-spec.md` y su plan de implementación.

## Cuatro roles y prioridad de producto

- **Cliente (`TOURIST`):** usuario principal; se registra, accede por QR a recomendaciones privadas, consulta y consume beneficios, y administra su progreso, créditos, compras y canjes propios. `TOURIST` es el identificador técnico existente, no un quinto rol.
- **Colaborador (`COLLABORATOR`):** refiere clientes mediante su QR único a los prestadores de su carpeta. El administrador controla su habilitación y carpeta; no modifica ofertas.
- **Prestador (`PROVIDER`):** negocio amigo que otorga beneficios y gestiona solo su propuesta, imágenes y ofertas asignadas mediante revisión de publicación.
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

E0: documentación inicial. E1: base reproducible entregada. E2: autenticación, sesiones revocables y acceso privado por QR, con proxy de desarrollo que sanea cabeceras de cliente. E3: prestadores, ofertas y carpetas privadas implementados y revisados en `f28e9cb`. E4: consumos únicos por Cliente/Prestador, QR+PIN del Prestador, créditos, progreso y anulaciones con ajustes pendientes implementados en la rama de etapa; ver `docs/plans/04-consumos-creditos.md`. F1: tres prototipos demo aislados bajo `/prototipos`. F2: experiencia funcional del Cliente con portada Beneficios y Pasaporte en Mi viaje, conectada a E2–E4; implementada en rama de etapa con informe en `.superpowers/sdd/00-roadmap/task-9-report.md`. El registro sigue creando solo `TOURIST`; Colaborador, Prestador y Administrador conservan espacios y permisos distintos que se completarán en F3. E5-E6 pendientes. Task 8 migró herramientas a uv/pnpm; el orden es E4→F2→E5→E6→F3. Las ramas se apilan para revisión incremental y no se fusionan PRs desde este trabajo.

Toolchain aprobada: Python 3.13.16 con uv 0.11.3 en `backend/pyproject.toml` y `backend/uv.lock`; Node 24.19.0 con pnpm 11.22.0 en `frontend/package.json` y `frontend/pnpm-lock.yaml`. Docker Compose sigue siendo el arranque predeterminado; uv nativo es opcional para el IDE y las herramientas locales.

Corrección Task 1: el acceso local a `/admin/` y `/static/admin/` se enruta de Vite a Django; el backoffice conserva su sesión y CSRF independientes del JWT de la API. Task 2 incorpora catálogo general público de beneficios publicados y vigentes, con interruptor singleton en Admin y medios revalidados por solicitud; carpetas QR siguen privadas. Task 3 permite consumo directo con colaborador nulo, conserva referencia estricta cuando se aporta y exige beneficio publicado/vigente para acreditar, independientemente del interruptor público. El retiro de prototipos sigue en Task 4 del plan 07.
