# Contexto y decisiones

## Objetivo

Captar registros de turistas y verificar consumos en la red para otorgar beneficios, progreso y créditos canjeables por regalería 3D. El catálogo referido no es público.

## Cuatro roles y prioridad de producto

- **Cliente (`TOURIST`):** usuario principal; se registra, accede por QR a recomendaciones privadas, consulta y consume beneficios, y administra su progreso, créditos, compras y canjes propios. `TOURIST` es el identificador técnico existente, no un quinto rol.
- **Colaborador (`COLLABORATOR`):** refiere clientes mediante su QR único a los prestadores de su carpeta. El administrador controla su habilitación y carpeta; no modifica ofertas.
- **Prestador (`PROVIDER`):** negocio amigo que otorga beneficios y gestiona solo su propuesta, imágenes y ofertas asignadas mediante revisión de publicación.
- **Administrador (`ADMIN`):** gestiona usuarios, habilitaciones, prestadores, carpetas, QR, reglas, pedidos y auditoría.

Un cliente puede acceder a más de una carpeta después de escanear sus respectivos QR. Cada consumo conserva el colaborador que originó esa referencia. Deshabilitar o rotar el QR revoca el acceso de esa referencia, sin eliminar el historial transaccional. El registro público crea solo `TOURIST` y no permite autoasignar privilegios.

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

E0: documentación inicial. E1: base reproducible entregada. E2: autenticación, sesiones revocables y acceso privado por QR, con proxy de desarrollo que sanea cabeceras de cliente. E3: prestadores, ofertas y carpetas privadas implementados y revisados en `f28e9cb`. F1: tres prototipos de demostración integrados. La decisión de producto está confirmada: Beneficios como portada principal y Pasaporte para Mi viaje; F1 aún no conecta la API. Cliente (`TOURIST`) es la experiencia objetivo. Colaborador, Prestador y Administrador conservan espacios y permisos distintos que se completarán en F3. E4-E6 pendientes. La migración de herramientas a uv/pnpm corresponde a Task 8; F2 y F3 se ejecutan después de E6 y F2, respectivamente. Las ramas se apilan para revisión incremental y no se fusionan PRs desde este trabajo.

Toolchain aprobada: Python 3.13.16 con uv 0.11.3 en `backend/pyproject.toml` y `backend/uv.lock`; Node 24.19.0 con pnpm 11.22.0 en `frontend/package.json` y `frontend/pnpm-lock.yaml`. Docker Compose sigue siendo el arranque predeterminado; uv nativo es opcional para el IDE y las herramientas locales.
