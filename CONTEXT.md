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

E0: documentación inicial. E1: base reproducible entregada. E2: autenticación, sesiones revocables y acceso privado por QR, con proxy de desarrollo que sanea cabeceras de cliente. E3: prestadores, ofertas y carpetas privadas implementados y revisados en `f28e9cb`. F1: tres prototipos completos integrados en esta rama; la elección de variante y la conexión de API siguen pendientes. La experiencia objetivo es Cliente (`TOURIST`); las áreas de Colaborador, Prestador y Administrador tendrán acceso y permisos propios, todavía sin implementación funcional. E4-E6 pendientes. Las ramas backend se apilan para revisión incremental y no se fusionan PRs desde este trabajo.

Preferencia confirmada para cambio posterior: `uv` en backend y `pnpm` en frontend. npm sigue siendo el tooling de esta transición; la migración de herramientas será una tarea separada después de integrar F1.
