# Guía de desarrollo

El entorno local corre backend Django 5.2 sobre PostgreSQL 17, frontend React/Vite con Node 24, y Mailpit. Docker Compose monta el código para recarga y conserva base y archivos subidos en volúmenes. El nombre del directorio puede contener espacios.

```powershell
./scripts/dev.ps1 up
./scripts/dev.ps1 up -Demo
./scripts/dev.ps1 test
./scripts/dev.ps1 down
```

En macOS/Linux se usa `./scripts/dev.sh` con los mismos subcomandos (`up --demo`, `test`, `down`). `down` conserva los volúmenes. El código frontend se monta para hot reload; al cambiar `package.json` o `package-lock.json`, usar el script `up` para reconstruir la imagen de dependencias. Solo borrar volúmenes manualmente cuando se desee eliminar los datos locales.

El endpoint de salud es `/api/v1/health/` y verifica la base de datos, sin devolver detalles internos si falla. Esquema OpenAPI en `/api/schema/`; UI en `/api/docs/`. Administración en `/admin/` una vez creada una cuenta administrativa.

Si ya se habían creado las cuentas demo y falta su archivo local de contraseñas, `seed_demo` avisa sin cambiar claves. Solo si se desea rotar las claves de las cuentas demo que no figuran en ese archivo, ejecutar explícitamente `docker compose exec backend python manage.py seed_demo --recover-missing`. El comando conserva las demás entradas y nunca cambia contraseñas personalizadas en una ejecución normal.

Si el backend no inicia, revisá que Docker esté activo y que la base figure healthy con `docker compose ps`. Si cambiaste credenciales en `.env` después de inicializar el volumen, PostgreSQL conserva las credenciales anteriores; recreá el entorno solo si podés descartar sus datos. Si las fuentes web de Google no están disponibles, la interfaz conserva tipografía de respaldo del sistema.

Configuración de producción exige `DJANGO_SECRET_KEY` de al menos 50 caracteres y `DJANGO_ALLOWED_HOSTS`; nunca uses las credenciales locales. `seed_demo` se bloquea con `DEBUG=False`. Mailpit está disponible para correo local; no hay proveedor de correo externo configurado. Mercado Pago y tareas asíncronas están pendientes para etapas posteriores.
