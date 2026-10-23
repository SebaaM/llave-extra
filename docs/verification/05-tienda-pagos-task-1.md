# E5 Task 1 — dominio, catálogo, pedidos y canjes

Fecha: 23/10/2026. Rama `feature/tienda-pagos`, base `4821be5`. Implementación local para revisión independiente; no cierra E5 ni valida Mercado Pago externo.

## Alcance comprobado

- App `shop`, catálogo público independiente y medios revalidados; imágenes inactivas solo mediante sesión Admin autorizada.
- Pedidos propios, rechazo de roles empresariales/Admin, Cliente activo/verificado para escrituras, entrada estricta y límites de 20 productos/99 unidades.
- Canje con servicios E4, rollback de billetera insuficiente/congelada, stock atómico y claves canónicas durables. Snapshots, líneas, claves y auditoría inmutables con triggers PostgreSQL; totales y clave comprobados al commit.
- Cancelación propia y revisión administrativa, reintegro vinculado al débito original, restitución única de stock; preparación/entrega bloqueadas por solicitudes y refunds.
- Admin en español, sin edición/deleción financiera ni stock absoluto. Ajustes delta auditados; formulario viejo no sobrescribe stock reservado.
- MONEY solo reserva local de 15 minutos y outbox CREATE persistido, con clave externa/payload inmutables y campos de lease/fencing. Default `disabled`; `fake` prohibido en producción; `mercadopago` todavía cerrado hasta Task 2.

## Entorno y comandos

Docker Desktop inicialmente apagado: primer `up` falló al no encontrar `dockerDesktopLinuxEngine`. El controlador inició Docker Desktop y se continuó sin cambios sobre servicios principales.

Proyecto aislado `llaveextra-e5`; PostgreSQL 17 y Redis de Compose, volúmenes aislados, `run --no-deps` sin publicar puertos. No se recreó/resembró la base principal, no se cambiaron credenciales ni se aplicaron allí migraciones. Suite usa la base PostgreSQL `test_` y Redis DB 1 aislados. Backend construido con Python 3.13.16/uv 0.11.3 y lock existente.

| Comando | Resultado final |
| --- | --- |
| `docker compose -p llaveextra-e5 up -d db redis` | Servicios aislados iniciados, exit 0 |
| `docker compose -p llaveextra-e5 build backend` | Imagen creada, exit 0 |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py makemigrations shop` | Migración inicial generada; guardas SQL añadidas como 0002 |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q shop/tests` | Pase intermedio 39/39; se agregaron luego 5 casos incluidos en suite final |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q` | **141 passed in 54.12s**: 97 previas + 44 tienda |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend ruff check .` | All checks passed, exit 0 |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py makemigrations --check --dry-run` | No changes detected, exit 0 |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py spectacular --validate --fail-on-warn --file /tmp/e5-openapi.yaml` | Exit 0, sin advertencias/errores |
| `git diff --check` | Exit 0; solo advertencias de normalización CRLF→LF, sin errores de whitespace |

La primera corrida de tienda tuvo 34 aprobadas y 5 fallos: un fixture duplicaba el email Admin y el serializer estricto devolvía un error de lista donde DRF esperaba diccionario. Se corrigieron las causas y se verificaron los casos. Primera regresión completa 136/136; auto-revisión añadió ruta de preview Admin y cinco pruebas, justificando la segunda corrida completa de 141.

Concurrencia comprobada con conexiones PostgreSQL independientes y barrera de arranque: misma clave en créditos/dinero, último stock, último saldo, carritos múltiples en orden inverso, delta administrativo frente a checkout, doble aprobación de reintegro y cancelación frente a entrega. Locks y statements tienen timeout en estos tests para detectar bloqueos persistentes.

## Límites y siguiente gate

Task 2 implementa adapter/worker/webhook, vencimiento de reservas y cancelación/refund monetario. No hay HTTP ni simulador remoto operativo en Task 1, solo persistencia de reserva/outbox usando configuración de prueba. MONEY real permanece bloqueado; ninguna interfaz administrativa confirma dinero manualmente. No hay evidencia de sandbox Mercado Pago ni QA visual de Admin desde navegador. El frontend no cambió y sus suites no corresponden a esta tarea. Migraciones ejecutadas en BD de tests, nunca en la base principal. El contrato OpenAPI es dinámico, sin copia estática versionada.

Se requiere revisión independiente de Task 1 antes de Task 2; el informe local de traspaso está en `.superpowers/sdd/05-tienda-pagos/task-1-report.md`.
