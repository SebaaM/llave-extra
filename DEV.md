# Guía de desarrollo

El entorno local predeterminado corre backend Django 5.2 sobre PostgreSQL 17, frontend React/Vite con Node 24.19.0, Redis para límites compartidos y Mailpit. Docker Compose monta el código para recarga y conserva base y archivos subidos en volúmenes. Vite usa polling de un segundo para detectar cambios en bind mounts de Docker Desktop en Windows. Las dependencias se instalan desde los locks con uv 0.11.3 y pnpm 11.22.0; el nombre del directorio puede contener espacios. En Docker, npm se usa solo como bootstrap para instalar globalmente pnpm 11.22.0; las dependencias del proyecto se instalan con `pnpm install --frozen-lockfile`.

```powershell
./scripts/dev.ps1 up
./scripts/dev.ps1 up -Demo
./scripts/dev.ps1 test
./scripts/dev.ps1 down
```

En macOS/Linux se usa `./scripts/dev.sh` con los mismos subcomandos (`up --demo`, `test`, `down`). `down` conserva los volúmenes. El código frontend se monta para hot reload; al cambiar `package.json`, `pnpm-lock.yaml` o `pnpm-workspace.yaml`, ejecutar `./scripts/dev.ps1 up` o `./scripts/dev.sh up` para reconstruir la imagen de dependencias. Solo borrar volúmenes manualmente cuando se desee eliminar los datos locales.

## uv nativo opcional

Docker Compose es la forma recomendada de ejecutar y probar la aplicación; no requiere Python ni Node en el host. Para que un IDE use el entorno Python local, ejecutá desde PowerShell:

```powershell
Set-Location backend
uv sync --locked
uv run --locked ruff check .
uv run --locked python -c "import django, rest_framework, redis, qrcode; print(django.get_version())"
```

Esto crea `backend/.venv`, ignorado por Git. Las pruebas nativas de dominio requieren PostgreSQL y Redis alcanzables desde el host, junto con `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST=127.0.0.1`, `POSTGRES_PORT`, `REDIS_URL=redis://127.0.0.1:<puerto>/1` y `DJANGO_SETTINGS_MODULE=config.settings.test`; después se ejecutan con `uv run --locked pytest -q`. La configuración de aplicación local también requiere `DJANGO_SECRET_KEY`, `JWT_SIGNING_KEY`, `QR_SIGNING_KEY`, `DJANGO_ALLOWED_HOSTS`, `PUBLIC_APP_URL` y SMTP local en `MAILPIT_HOST=127.0.0.1`/`MAILPIT_PORT`. Configurá esos valores en el entorno local y vinculá únicamente servicios locales accesibles. Fuera de Docker, `db`, `redis` y `mailpit` no son hostnames válidos; no abras puertos de servicios en todas las interfaces.

El endpoint de salud es `/api/v1/health/` y verifica la base de datos, sin devolver detalles internos si falla. Esquema OpenAPI en `/api/schema/`; UI en `/api/docs/`. Administración en `/admin/` una vez creada una cuenta administrativa.

El producto usa `/` y `/beneficios` para catálogo público, `/recomendaciones` y `/referencia` para acceso privado por QR, `/consumo` para validación directa o referida y `/mi-viaje` para pasaporte. Los prototipos F1 ya no están enrutados. El frontend usa JWT access solo en memoria, refresh HttpOnly same-origin y CSRF para endpoints de autenticación. Las consultas y fotos del catálogo público no adjuntan JWT; los medios comerciales siguen detrás de endpoints con política de publicación. Las APIs privadas responden `no-store`; las imágenes protegidas se recuperan por endpoints autorizados y Blob, no con URLs bearer. Un QR se transporta en fragmento y se limpia de la barra antes de usar la API. Las fotos demo aprobadas se agregan a campos vacíos con `docker compose exec backend uv run --locked python manage.py seed_demo_media` en DEBUG; ver [créditos](docs/assets.md). El contrato de cada pantalla está descrito en el [plan frontend](docs/plans/frontend.md) y las verificaciones F2 en [Task 9](.superpowers/sdd/00-roadmap/task-9-report.md).

El backoffice operativo de la red usa `/prestador` (resumen, negocio, beneficios, QR/PIN y cuenta) y `/colaborador` (resumen, recomendaciones, catálogo privado, QR y cuenta). `/espacio` resuelve según el rol; Admin abre el documento Django `/admin/`. El Prestador no elige negocio: carga el único asignado, con estado pendiente si todavía no tiene uno y cierre ante una asignación inconsistente. Puede enviar propuestas en borrador y editar sus campos permitidos; editar un beneficio publicado lo devuelve a revisión según la respuesta del servidor. El Colaborador agrega o quita beneficios concretos de su propia carpeta mediante el selector privado, que sigue disponible si se apaga el catálogo público. Las demás ofertas del mismo negocio no se incorporan automáticamente.

Los módulos React de gestión viven en `frontend/src/product/workspace/`, con estilos prefijados y menú móvil accesible. Archivos e imágenes usan el cliente autenticado y `FormData` sin fijar el boundary multipart. QR y PIN no se guardan en almacenamiento del navegador: el QR se consulta solo al entrar en su sección y se renueva al volver al foco; las Object URLs se revocan al salir y las respuestas tardías se descartan al cambiar la sesión. El PIN es de solo escritura y se limpia al enviarlo. Para verificar frontend, ejecutar secuencialmente `docker compose exec frontend pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm build` (cada comando dentro del mismo servicio). La suite usa APIs simuladas; el QA real sobre los servicios locales se registra en la verificación del plan 08. Las cuentas demo se consultan únicamente en `docs/cuentas-prueba.local.md`, ignorado por Git; no publicar cuentas, claves, PIN ni QR en capturas o informes.

E4 agrega `/api/v1/consumptions/` para acreditar con QR del Prestador, PIN e `Idempotency-Key`; el Cliente necesita email verificado y el Prestador debe tener un beneficio publicado y vigente. La corrección del catálogo permite omitir `folder_id` o enviarlo nulo para un consumo directo sin colaborador. Si se aporta una carpeta, debe estar vigente e incluir ese Prestador; una referencia inválida nunca se transforma en consumo directo. `/api/v1/me/wallet/`, `/api/v1/me/consumptions/` y `/api/v1/me/progress/` muestran solo datos propios. Las reglas globales, excepciones por Prestador, PIN/QR, consumos y ajustes se gestionan en Admin. Una anulación exige motivo y puede congelar canjes si el saldo no alcanza. El Prestador titular puede fijar su PIN y consultar su QR en `/api/v1/provider/providers/<uuid>/consumption-credential/`. La guía del contrato y las resoluciones auditadas están en [E4](docs/plans/04-consumos-creditos.md).

El backoffice usa etiquetas explícitas en español para aplicaciones, modelos, campos, columnas y acciones, conservando sus nombres técnicos y permisos. Sin esos metadatos, Django deriva nombres desde el código. Los textos de objetos guardados antes de la traducción en el historial de auditoría conservan su representación original. El catálogo público y la presentación de cada red se configuran desde Admin; ver [verificación de esta entrega](docs/verification/07-catalogo-publico.md).

El límite de intentos de PIN usa Redis compartido y falla cerrado; `RATE_CONSUMPTION_MAX` y `RATE_CONSUMPTION_WINDOW` aceptan solo enteros positivos. Para probar con una base descartable, usar un proyecto Compose aislado y una ruta ignorada propia en `DEMO_CREDENTIALS_PATH` al ejecutar `seed_demo`, evitando escribir PIN o cuentas temporales en el archivo de demo principal. Nunca usar SQLite para estas pruebas.

Si ya se habían creado las cuentas demo y falta su archivo local de contraseñas, `seed_demo` avisa sin cambiar claves. Solo si se desea rotar las claves de las cuentas demo que no figuran en ese archivo, ejecutar explícitamente `docker compose exec backend python manage.py seed_demo --recover-missing`. El comando conserva las demás entradas y nunca cambia contraseñas personalizadas en una ejecución normal.

`seed_demo` hace un preflight de todas las cuentas existentes antes de agregar una nueva; si faltan claves locales, no deja altas parciales. La primera carga incorpora 12 prestadores históricos identificados como `demo` y dos carpetas de ejemplo; reintentos no restauran asignaciones, publicación ni membresías modificadas por Admin. Cumbre queda sin oferta inferida. Los datos proceden de páginas públicas revisadas el 15-10-2026 y requieren confirmación antes de uso real. Para obtener un QR demo, iniciá sesión con la cuenta colaborador indicada en `docs/cuentas-prueba.local.md` y consultá `GET /api/v1/collaborator/qr/` con su bearer; nunca se guarda un token QR fijo en el repositorio.

Las imágenes de prestadores y ofertas se guardan en el volumen `private_media_data`, fuera de `MEDIA_ROOT`. No configures un alias HTTP directo a `/app/private_media`; las rutas autorizadas entregan los archivos. El frontend borra el fragmento QR de la URL antes de cargar recursos externos y usa `Referrer-Policy: no-referrer`.

Si el backend no inicia, revisá que Docker esté activo y que la base figure healthy con `docker compose ps`. Si cambiaste credenciales en `.env` después de inicializar el volumen, PostgreSQL conserva las credenciales anteriores; recreá el entorno solo si podés descartar sus datos. Si las fuentes web de Google no están disponibles, la interfaz conserva tipografía de respaldo del sistema.

El bootstrap añade `JWT_SIGNING_KEY`, `QR_SIGNING_KEY` y `REDIS_URL` a un `.env` E1 existente sin cambiar claves previas. Configuración de producción exige tres claves independientes de al menos 50 caracteres y `DJANGO_ALLOWED_HOSTS`; nunca uses las credenciales locales. `seed_demo` se bloquea con `DEBUG=False`. Mailpit está disponible para correo local; no hay proveedor de correo externo configurado. Si SMTP falla al registrar, la cuenta queda creada y el usuario puede pedir reenvío. Mercado Pago y tareas asíncronas están pendientes para etapas posteriores.
