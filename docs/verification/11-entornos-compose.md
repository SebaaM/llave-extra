# Verificación de entornos Compose — 31/10/2026

- `docker compose config --quiet` y `docker compose --env-file .env.prod -f compose.prod.yaml config --quiet`: configuración válida con valores temporales de prueba.
- Construcción del backend y frontend de desarrollo, y `docker build -f frontend/Dockerfile.prod -t llaveextra-nginx-production-check frontend`: completadas; el build de producción ejecutó TypeScript y Vite.
- `docker compose -p llaveextra-nginx-check run --rm -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q`: 274 pruebas aprobadas sobre PostgreSQL/Redis aislados.
- `docker compose -p llaveextra-nginx-check run --rm --no-deps backend ruff check .`: aprobado.
- `nginx -t` en desarrollo: aprobado. Tras migrar la base aislada, HTTP por Nginx: inicio y beneficios 200, salud 200, admin 302 al login. La primera petición de salud antes de que Django terminara de iniciar devolvió 502.

No se ejecutó despliegue completo de producción ni prueba de TLS/SMTP real, recuperación de backups o pagos externos.

Verificación adicional sobre develop actualizado (31/10/2026): `./scripts/dev.ps1 test`: 285 pruebas PostgreSQL/Redis aprobadas; una advertencia por permisos del caché de pytest. `docker compose run --rm --no-deps backend ruff check .`: aprobado.
