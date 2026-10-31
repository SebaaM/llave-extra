# Llave Extra

Red de beneficios turísticos de Ushuaia. Esta guía describe el estado actual y cómo arrancar desde cero. El catálogo público muestra beneficios publicados y vigentes; las carpetas de recomendaciones requieren QR y autorización del servidor. [Sitemap provisorio](docs/sitemap.md) · [API](docs/api.md) · [Reglas](docs/business-rules.md) · [Operación de tienda](docs/shop-operations.md).

## Desarrollo desde cero

Requisitos: Git, Docker Desktop con Compose activo y, en macOS/Linux, OpenSSL. Cloná el repositorio, abrí una terminal en la raíz y ejecutá:

```powershell
./scripts/dev.ps1 up -Demo
```

En macOS/Linux: `./scripts/dev.sh up --demo`. Se genera `.env` local ignorado con secretos aleatorios, se construyen imágenes, inician PostgreSQL, Redis, Django, Vite, Nginx y Mailpit, se aplican migraciones y se cargan datos demo. Sin datos de ejemplo usá `up` sin el parámetro demo. Los volúmenes persisten; `./scripts/dev.ps1 down` o `./scripts/dev.sh down` detienen sin borrarlos. Para pruebas backend PostgreSQL: `./scripts/dev.ps1 test` o `./scripts/dev.sh test`. [Más detalles y verificaciones](DEV.md).

### Cuentas de prueba locales

El seed crea las siguientes cuentas sintéticas y genera sus contraseñas en `docs/cuentas-prueba.local.md` (ignorado por Git). Consultá ese archivo local: no hay contraseñas fijas versionadas. Una ejecución normal no cambia contraseñas existentes; si falta el archivo, la recuperación explícita está en [DEV.md](DEV.md). No usar estas cuentas en producción.

| Rol | Emails demo |
| --- | --- |
| Administrador | `admin@llaveextra.test` |
| Prestador | `prestador.tiger@llaveextra.test`, `prestador.cumbre@llaveextra.test` |
| Colaborador | `colaborador@llaveextra.test`, `colaborador.secundario@llaveextra.test` |
| Cliente | `turista@llaveextra.test`, `turista.pendiente@llaveextra.test`, `turista.creditos@llaveextra.test`, `turista.ajuste@llaveextra.test`, `turista.extra@llaveextra.test` |

### Puertos locales y rutas

| Dirección | Uso |
| --- | --- |
| http://localhost:8080/ | Entrada recomendada Nginx: interfaz, API y Django Admin en el mismo origen |
| http://localhost:8080/gestion | Panel React de administración |
| http://localhost:8080/admin/ | Django Admin; sesión independiente |
| http://localhost:8080/api/v1/health/ | Salud de la API |
| http://localhost:8080/api/schema/ y http://localhost:8080/api/docs/ | OpenAPI y documentación interactiva |
| http://localhost:8025/ | Buzón Mailpit de desarrollo |
| http://localhost:5173/ | Vite directo para desarrollo |
| http://localhost:8000/ | Django directo para desarrollo |

PostgreSQL 5432, Redis 6379 y SMTP Mailpit 1025 son internos a Docker y no se publican al host. No montar ni publicar `private_media`; sus archivos se entregan con autorización.

## Producción desde cero

El archivo `compose.prod.yaml` usa volúmenes separados, frontend compilado servido por Nginx, Gunicorn, PostgreSQL y Redis. Nginx termina TLS y publica solo 80/443; no incluye Mailpit ni datos demo. Hace falta un servidor con Docker/Compose, dominio apuntando al servidor, certificados TLS válidos y SMTP real. El aprovisionamiento y renovación del certificado se realiza fuera de Compose. Preparar copias y restauración de PostgreSQL y medios privados antes de operar.

1. Copiá `.env-example` como `.env.prod` (archivo ignorado). Configurá `DJANGO_SECRET_KEY`, `JWT_SIGNING_KEY`, `QR_SIGNING_KEY` independientes y aleatorias de al menos 50 caracteres, `DJANGO_ALLOWED_HOSTS` con el dominio, `PUBLIC_APP_URL=https://tu-dominio`, `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD` fuertes. Mantené `SHOP_PAYMENT_PROVIDER=disabled` hasta completar sandbox y operación. No publiques el archivo.
2. Configurá `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` o `EMAIL_USE_SSL` (no ambos), y `DEFAULT_FROM_EMAIL`. Completá `TLS_CERT_DIR` con ruta absoluta del directorio que contiene `fullchain.pem` y `privkey.pem`, legibles por Nginx. Los campos opcionales vacíos del ejemplo deben eliminarse o completarse: los parámetros numéricos de límites no aceptan cadenas vacías.
3. Desde la raíz, ejecutá:

```sh
docker compose --env-file .env.prod -f compose.prod.yaml build
docker compose --env-file .env.prod -f compose.prod.yaml up -d db redis
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend python manage.py migrate
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend python manage.py collectstatic --noinput
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend python manage.py createsuperuser
docker compose --env-file .env.prod -f compose.prod.yaml up -d
docker compose --env-file .env.prod -f compose.prod.yaml ps
```

4. Abrí `https://tu-dominio/`, verificá `/api/v1/health/`, login, email real y paneles. El superusuario se crea con rol ADMIN; `/gestion` exige además usuario activo, staff y superusuario. `/admin/` tiene sesión propia. Renovado el certificado, recargá Nginx con `docker compose --env-file .env.prod -f compose.prod.yaml exec nginx nginx -s reload`. Para detener sin borrar datos: `docker compose --env-file .env.prod -f compose.prod.yaml down`.

Este Compose es una base de despliegue: todavía requiere validación integral en el servidor, monitoreo, backups/restauración y programación de tareas de tienda; no se ha validado el sandbox externo de pagos. Nunca ejecutar seeds demo en producción. [Operación y reconciliación](docs/shop-operations.md).

## Alcance de los usuarios

- **Cliente (`TOURIST`)**: se registra públicamente, verifica email, consulta catálogo público, abre recomendaciones con QR válido, registra consumo directo o referido con QR y PIN del prestador y consulta créditos, progreso e historial propios. El email verificado es requisito para consumo. La UI de tienda es una muestra visual; compra y canje desde ella están pendientes.
- **Colaborador (`COLLABORATOR`)**: cuando Admin lo habilita, selecciona y quita beneficios concretos para su propia carpeta, consulta su selección y comparte su QR. No hereda automáticamente todas las ofertas del negocio ni modifica reglas de créditos. El acceso de Clientes se comprueba en cada solicitud.
- **Prestador (`PROVIDER`)**: administra la ficha y beneficios de su único negocio asignado, crea propuestas en borrador, edita campos permitidos y gestiona QR/PIN de consumo. Admin controla asignación y publicación.
- **Administrador (`ADMIN`)**: gestiona usuarios y habilitaciones, asigna el negocio del Prestador, publica beneficios, configura catálogo y reglas de créditos, opera consumos, saldos, productos, pedidos y acciones auditadas desde `/gestion` y Django Admin. Las analíticas E6 siguen pendientes.

Las verificaciones y el control de acceso son del servidor; ocultar una opción en pantalla no concede ni revoca permisos. [Panel de administración](docs/panel-administracion.md) · [GitFlow](docs/gitflow.md) · [Contexto](CONTEXT.md).
