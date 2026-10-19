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

E0: documentación inicial. E1: base reproducible entregada. E2: autenticación, sesiones revocables y referencia QR privada con PR abierto. E3: prestadores, ofertas y carpetas privadas en rama de etapa, pendientes de revisión independiente. E4-E6 pendientes. F1 tiene tres prototipos completos y revisados en un worktree separado; falta integrar su rama y elegir la variante antes de conectar la interfaz funcional. No se fusionan PRs desde este trabajo; las ramas de backend se apilan para revisión incremental.

Preferencia de herramientas confirmada para el siguiente cambio separado: `uv` en backend y `pnpm` en frontend. E3 aún se verifica con Docker y las dependencias actuales; la migración de herramientas no forma parte de esta etapa.
