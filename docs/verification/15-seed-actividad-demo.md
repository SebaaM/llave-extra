# Seed de actividad demo — verificación 02/11/2026

Rama `feature/seed-actividad-demo`, base `4008ab4`. Pedido: carga opcional mayor con consumos y actividad para probar backoffice, mediante un comando independiente. Diseño y plan en `docs/superpowers/`; guía de uso en `docs/demo-activity.md`.

## Resultado de la carga predeterminada de pruebas

PostgreSQL/Redis de pruebas (`config.settings.test`), separados de los datos y límites de la aplicación. 300 Clientes, 30 negocios/Prestadores, 10 colaboradores, 1 Admin, 60 beneficios y 12 productos. 980 consumos, 205 pedidos y 20 ajustes abiertos. Pedidos agrupados: CANCELED 20, PAID 49, PAYMENT_REVIEW 9, PENDING_PAYMENT 10, PICKED_UP 70, READY 26, REFUNDED 12, REFUND_PENDING 9.

Se vuelve a ejecutar y se comparan contraseñas almacenadas, IDs de consumos/pedidos, saldos, banderas de bloqueo, libro de movimientos, stock, estados y auditoría. Cada billetera coincide con la suma de su libro; cada producto coincide con ajustes de stock menos unidades de pedidos que aún lo tienen asignado.

La prueba comprueba respuestas 200 en dashboard y listados administrativos de usuarios, prestadores, beneficios, colaboradores, consumos, billeteras, ajustes, productos, pedidos, cancelaciones, operaciones de pago y actividad, más resumen del Colaborador. Son peticiones APIClient con cuentas sintéticas de prueba; no se presenta como QA visual de navegador.

## Comandos y resultados

- Suite focal inicial: `docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest accounts/tests/test_activity_demo.py -q`: 11 aprobadas.
- Suite backend completa: `docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q`: 399 aprobadas en 344,27 s. Incluye carga predeterminada y repetición, antes de los últimos controles de exclusividad de archivo y lote de locks.
- Suite focal del delta final: `docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest accounts/tests/test_activity_demo.py -q`: 15 aprobadas en 230,63 s. Incluye manifiesto de otra base, rechazo de atomic externo y dos conexiones PostgreSQL que comprueban el bloqueo del siguiente prestador mientras se retiene CreditPolicy, más carga completa/repetición y lectura del backoffice.
- `docker compose exec -T backend ruff check .`: aprobado.
- `docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py makemigrations --check --dry-run`: sin cambios.
- `docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py spectacular --validate --fail-on-warn --file /tmp/activity-demo-schema.yaml`: aprobado, sin avisos. Sin cambios de contrato ni migraciones.
- `git diff --check`: aprobado. `git check-ignore` confirma exclusión de credenciales predeterminadas, ruta alternativa y archivo temporal.
- `seed_activity_demo --help`: comando disponible; no ejecuta la carga.
- Consulta final de la base principal: cero Clientes `activity.cliente.*` y cero checkpoints `activity-demo:*`. No se cargó ni reseteó la aplicación.

## Revisión y límites

Revisión independiente estática sin hallazgos pendientes en el delta final. Se corrigieron: checkpoint de cuentas omitidas (para no crear nuevos pedidos tras una edición manual), rechazo de transacción externa, prebloqueo ordenado de perfiles/prestadores/beneficios antes de retener política global, e identidad exclusiva por base del archivo privado. El informe local se conserva en `work/seed-activity-review.md` (ignorado).

El seeder selecciona FakeGateway explícitamente y solo reclama operaciones de pedidos propios; las pruebas bloquean `urllib.request.urlopen`. No hay HTTP externo, seeds de arranque, modificación de configuración existente ni edición de estados/saldos/stock/historia para fabricar escenarios. Operaciones financieras, transiciones y auditorías se generan mediante servicios de dominio. Credenciales se escriben antes de commits de cuentas, con permisos restrictivos y reemplazo atómico; nunca se incluyen en resultados/auditorías.

Las fechas son actuales y EXPIRED llega mediante la operación normal tras el plazo, sin backdating. La tienda React sigue visual. Mercado Pago real no está validado por esta demo. No hubo cambios frontend y no se atribuye una nueva ejecución de su suite/build a este trabajo.
