# E5 — verificación de pagos y recuperación

Fecha: 24/10/2026. Rama `feature/tienda-pagos`, base Task 1 `a7a6b59` aprobada por revisión independiente sin hallazgos. Backend/API/Admin; frontend y E6 fuera de alcance. Task 2 queda pendiente de gate independiente, PR y CI del orquestador. No se usaron credenciales de Mercado Pago ni hubo llamadas monetarias externas.

## Comprobaciones locales

Proyecto Docker aislado `llaveextra-e5`, PostgreSQL 17 y Redis reales healthy. Ninguna prueba usa SQLite. Entorno `DJANGO_SETTINGS_MODULE=config.settings.test` y dependencias bloqueadas de la imagen; comandos desde la raíz del repositorio:

| Comando | Resultado |
| --- | --- |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q shop/tests` | 96 passed in 60.58s en primera ola; luego se agregaron tres pruebas de configuración/fencing/error |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q` | Final: **196 passed in 79.28s**; ola anterior 196 passed in 74.88s |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend ruff check .` | All checks passed |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py makemigrations --check --dry-run` | No changes detected |
| `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend python manage.py spectacular --file /tmp/e5-openapi.yaml --validate --fail-on-warn` | Exit 0, sin errores ni advertencias |

Las migraciones 0003/0004 se aplicaron al crear la base PostgreSQL de pruebas. Agregan contrato HTTP congelado/versionado, inbox y fake durable; guardas impiden mutar request/seller, retroceder versiones o cambiar identidad de notificaciones. No modifican la guarda del payload de Task 1. El orquestador puede comprobar por separado comandos reales en la base aislada; la base principal y sus cuentas permanecen fuera de esta tarea.

QA HTTP del orquestador: `work/e5_http_qa.py` terminó exit 0 contra servidor Django real en la base por defecto aislada `llaveextra-e5`. Verificó login JWT+CSRF, catálogo, checkout 201, PENDING_PAYMENT → PAID → REFUND_PENDING → REFUNDED, replay 200 con mismo pedido, stock devuelto una vez, sesión Admin separada y formulario con stock readonly. Migraciones desde cero 0001–0004 aprobadas en esa base. Solo cuentas sintéticas nuevas; sin datos principales ni Mercado Pago externo. El primer intento del helper esperaba confirmación automática del fake tras POST; se corrigió el helper para comprobar stock retenido y simular `refunded` explícitamente antes de GET. No requirió cambios de producto.

Una anotación inicial del body webhook produjo una advertencia OpenAPI; se corrigió a schema por media type y la validación final terminó exit 0 sin advertencias. Ruff global final también pasó. Ningún fallo de prueba de dominio quedó pendiente.

## Cobertura

- Contratos CREATE/GET/refund/search: método, ruta fija, headers, claves distintas y body; sin HTTP dentro de atomic; redirects denegados, URL argentina HTTPS, IDs acotados, respuesta/JSON inválidos, respuesta excesiva y errores sanitizados. Fixtures locales, no prueba de interoperabilidad externa.
- Reconciliación coteja ID/referencia/seller/ARS/ARG/total; pagos íntegros, estados raíz y pagos concordantes. Refund exige IDs únicos, pertenencia a pagos, estado procesado y sumas completas por transacción; parcial, exceso, duplicado y `total_paid_amount=0` inconsistente no autorizan.
- Timeout de CREATE con remoto persistido recuperado por búsqueda sin webhook ni nuevo POST; 409 seguido de búsqueda/GET; ambigüedad en revisión. Contrato/seller inmutables y configuración cambiada/disabled bloquean nuevas llamadas.
- Dos conexiones compiten por el mismo lease: una sola reclamación. Crash, recuperación tras lease vencido y versión por pedido evitan aplicar la respuesta vieja. Prueba adicional compite RECONCILE contra REFUND con versiones diferentes.
- Vencimiento/cancelación mientras un GET está en vuelo revalidan estado bajo lock. Pago tardío nunca habilita entrega; stock una vez y replay mantiene pedido/claves. Refund error/POST ack conserva inventario; GET íntegro repone una vez. REFUNDED no vuelve a PAID.
- Estado desconocido o error de consulta después de PAID/READY bloquea retiro. Refund externo después de PICKED_UP conserva entrega/stock y audita incidencia financiera.
- Webhook HMAC literal con ID mayúsculo, timestamps de segundos/milisegundos, firma incorrecta, body discrepante, query duplicado, timestamp viejo/futuro, tamaño y dedupe. Mismo ID remoto con otra entrega permite PAID→REFUNDED. Webhook temprano recupera referencia con GET y agenda observación nueva; referencia desconocida permanece durable con backoff. No se confía en estado del body.
- Acciones administrativas de retry/refund/cancelación con motivo y permisos; retiro bloqueado. Seed ejecutado mediante parser CLI con IDs numéricos, idempotencia de productos/pedidos/saldo/stock, servicios E4 y recibos DEMO. Comandos de proceso/simulación/reconciliación/vencimiento probados sobre PostgreSQL; fake bloqueado fuera de desarrollo/test y producción protegida.

Task 1 aporta además stock/créditos concurrentes, idempotencia local, restricciones diferidas, privacidad/ownership y Admin. Su prueba que bloqueaba temporalmente cancelación monetaria se actualizó al comportamiento final aprobado de Task 2.

## Límites de la evidencia

Mercado Pago sandbox pendiente: no se cargaron secretos, no hubo cobros, no se probó webhook del proveedor ni redirect remoto. La [guía operativa](../shop-operations.md) describe cuentas de prueba/aplicación, gate de configuración y los casos pendientes. No inferir sandbox por prefijo del token. Los ejemplos oficiales inconsistentes se reemplazaron por fixtures concordantes propias; GET/refund/estados deben confirmarse en sandbox. La expiración remota de 15 minutos y renovación de `ts` en retries tampoco se afirmaron validadas.

No se ejecutaron pruebas frontend porque sus archivos/contratos de uso actuales no cambian. No hay scheduler desplegado, migración de base principal, publicación, push ni merge por el implementador. El gate independiente y QA operativo del orquestador se registran al completarlos.
