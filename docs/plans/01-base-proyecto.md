# E1 — Base reproducible del proyecto

## Entregado

- Backend Django 5.2.18 y DRF, configuración local/test/producción, usuario email-first con roles diferenciados y migración inicial, salud verificada contra PostgreSQL y esquema OpenAPI.
- Frontend mínimo React/TypeScript/Tailwind/Vite con tokens de color y tipografías Poppins/Montserrat.
- Compose para PostgreSQL 17.11, backend, frontend y Mailpit 1.31.6; volúmenes nombrados para datos y archivos.
- Bootstrap multiplataforma, seed demo idempotente, pruebas sobre PostgreSQL y CI.

## Uso y validación

Las instrucciones de arranque, URLs, roles y resolución de problemas están en `README.md` y `DEV.md`. Los comandos y resultados de verificación de esta entrega se registran en `.superpowers/sdd/00-roadmap/task-1-report.md`.

E1 no incorpora autenticación pública, catálogo, accesos QR, transacciones, pagos ni despliegue productivo. Correo externo y pagos siguen pendientes; Mailpit es solo el buzón local.
