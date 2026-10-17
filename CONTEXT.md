# Contexto y decisiones

## Objetivo

Captar registros de turistas y verificar consumos en la red para otorgar beneficios, progreso y créditos canjeables por regalería 3D. El catálogo referido no es público.

## Roles corregidos por el usuario

- **Administrador:** gestiona usuarios, prestadores, colaboradores, carpetas, QR, reglas, pedidos y auditoría.
- **Prestador:** negocio amigo que otorga beneficios y gestiona su propia propuesta, imágenes y ofertas.
- **Colaborador:** refiere turistas mediante su QR único a los prestadores de su carpeta. Su habilitación y carpeta son administradas por el administrador; no modifica ofertas de prestadores.
- **Turista:** accede a carpetas por QR, verifica consumos, consulta progreso y canjea o compra.

Un turista puede acceder a más de una carpeta después de escanear sus respectivos QR. Cada consumo conserva el colaborador que originó esa referencia. Deshabilitar o rotar el QR revoca el acceso de esa referencia, sin eliminar el historial transaccional.

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

Monorepo: `backend/`, `frontend/`, `scripts/`, `docs/`. Django 5.2 LTS/Python 3.13 y PostgreSQL 17. API versionada y OpenAPI. React/TypeScript/Tailwind. Docker Compose local con Mailpit; Redis y worker al necesitar límites compartidos y tareas.

## Estado

E0: documentación inicial. E1: base reproducible del proyecto entregada; autenticación y dominio siguen pendientes. E2-E6 y F1 pendientes. Los prototipos detienen la integración visual hasta elección del usuario. No se fusionan PRs; las ramas de backend se apilan para revisión incremental.
