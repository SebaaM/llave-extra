# Entornos Compose y documentación

**Objetivo:** proporcionar arranque reproducible de desarrollo y una base separada de producción con Nginx y guía de operación.

**Arquitectura:** desarrollo mantiene Django/Vite y añade proxy Nginx local; producción usa Gunicorn, frontend compilado y TLS en Nginx, PostgreSQL/Redis y volúmenes aislados. Las credenciales y certificados se proveen fuera del repositorio.

- [x] Incorporar Nginx local y configuración Compose separada para producción.
- [x] Documentar arranque, puertos, rutas, cuentas de prueba, roles y sitemap.
- [x] Marcar planes históricos y corregir documentación de roles y acceso.
- [x] Verificar imágenes, configuración Compose, backend sobre PostgreSQL y proxy de desarrollo; producción real queda pendiente.
- [ ] Validar en servidor real certificados, SMTP, backups y tareas programadas antes de operar.
