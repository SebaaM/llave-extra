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

## Corrección I1 del gate final — 24/10/2026

Hallazgo: un CREATE bloqueado podía convertir una reserva nunca pagada en PAYMENT_REVIEW sin salida por vencimiento/cancelación. Se agregó Order.payment_confirmed monotónica, respaldada por guarda y constraint PostgreSQL. Una revisión impaga sin operación de refund conserva el plazo de reserva, tenga o no ID remoto; una revisión de pago previamente confirmado y REFUND_PENDING retienen stock hasta GET íntegro de restitución. Predicado expirable_orders compartido por servicio/batch; cancelación propia también admite revisión. Claves, referencias, auditoría, late-pay y fencing se preservan.

Migración nueva 0005, sin editar 0001–0004: reconstruye confirmación desde estados y auditorías financieras existentes. Una prueba incremental 0004→0005 con datos históricos verifica estados acreditados, revisión antes/después de pago, pago tardío y refund pendiente sin prueba, conservando importes/stock. Ejecutada en test DB PostgreSQL; aplicación sobre base QA existente por root y re-review focal todavía pendientes al entregar el commit. Base principal sin tocar.

Comandos con prefijo `docker compose -p llaveextra-e5 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend`:

| Sufijo | Resultado final |
| --- | --- |
| `pytest -q shop/tests/test_reservations.py` | **17 passed in 23.92s** |
| `pytest -q` | **213 passed in 117.44s** |
| `ruff check .` | All checks passed |
| `python manage.py makemigrations --check --dry-run` | No changes detected |
| `python manage.py spectacular --file /tmp/e5-openapi.yaml --validate --fail-on-warn` | Exit 0, sin warnings |

La primera prueba de upgrade tenía una aserción de fixture Decimal contra string; se corrigió la comparación y las 17 regresiones pasaron. Cobertura nueva: CREATE/GET permanente con/sin remoto → expire/cancel; solicitud anterior al error; replay/stock una vez; recovery y pago tardío después de liberar; PAID/READY → review fuera de plazo conserva stock; refund pendiente sin confirmación no vence; fencing impide que un GET viejo marque pago confirmado. Sin cambios a frontend ni llamadas externas.

## Cierre del orquestador — 24/10/2026

Task 1 aprobada en a7a6b59. Revisión final e32851a detectó I1, confirmado por prueba focal PostgreSQL: CREATE rechazado podía dejar reserva impaga retenida. La única ola de corrección 4c9a402 añadió marca histórica, predicado común y 17 regresiones. Re-review focal: I1 ADDRESSED, cero Critical/Important/Minor nuevos; gate Task 2/rama Approved. Sin observaciones aplazadas. Límites de sandbox, UI F3 y scheduler desplegado conservados según alcance aprobado.

El orquestador aplicó 0005 a la BD QA existente (upgrade desde 0004, exit0) y repitió work/e5_http_qa.py con servidor HTTP real interno, exit0: JWT/CSRF, catálogo, PENDING_PAYMENT → PAID → REFUND_PENDING → REFUNDED, replay200/mismoID, stock retenido hasta confirmar y restituido una vez, sesión Django Admin y stock readonly. El helper inicialmente esperaba refund automático: se corrigió para simular confirmación explícita, sin cambiar producto. Solo escenarios sintéticos de llaveextra-e5, sin credenciales impresas ni pagos externos.

Se guardó pg_dump custom previo de la base local en el contenedor db, /tmp/llaveextra-antes-e5-20261024.dump; pg_restore --list pudo leerlo. Comprueba archivo legible, no restauración completa. Luego se aplicaron shop0001–0005 al entorno local existente sin seed/rotación de cuentas ni QR. Conteos antes/después idénticos:

| Entidad | Antes | Después |
|---|---:|---:|
| Usuarios | 17 | 17 |
| Prestadores | 14 | 14 |
| Beneficios | 14 | 14 |
| Asociaciones históricas | 10 | 10 |
| Beneficios seleccionados | 8 | 8 |
| Consumos | 6 | 6 |
| Movimientos de billetera | 7 | 7 |

La tienda principal queda sin productos/pedidos; datos DEMO separados y carga/reproducción en la guía. Se levantaron imágenes locales con dependencias bloqueadas. Salud Django8000 y proxy5173, portada5173 y login Admin vía5173 respondieron HTTP200; esto no es QA visual de navegador.

GitFlow: feature/tienda-pagos → develop. [PR #11](https://github.com/SebaaM/llave-extra/pull/11) depende de #10 todavía abierto; #9 fusionado externamente. No se fusionó PR alguno. CI de producto 4c9a402: [push40123417107](https://github.com/SebaaM/llave-extra/actions/runs/40123417107) exitoso en backend/frontend. Pasaron uv locked/Ruff/migraciones/pytest y pnpm frozen/lint/tipos/tests/build/audit. Comprobaciones del HEAD documental vigente en [PR #11](https://github.com/SebaaM/llave-extra/pull/11/checks).

## Decisiones del orquestador
- E5 implementa backend/API/Admin; la UI de tienda queda en F3 según el alcance ya aprobado. Coste si es incorrecto: la tienda no podrá usarse desde React hasta esa etapa.
- Iniciar desde PR #10 revisado y dirigir el nuevo PR a develop sin fusionar dependencias. Coste si es incorrecto: el diff incluye etapas previas y exige integrar #9/#10 en orden.
- Firmar Orders con data.id y ts literales, admitir epoch segundos/milisegundos y una ventana de diez minutos más 60 segundos de desfase futuro; recuperar entregas tardías con polling. Coste si es incorrecto: alguna notificación legítima podría rechazarse y demorarse hasta reconciliación; sandbox debe comprobar interoperabilidad.
- Entregar adaptador real explícitamente deshabilitado para operación hasta verificar sandbox; probar núcleo con simulador durable y fixtures sin cobros externos. Coste si es incorrecto: compra monetaria real requiere configuración y verificación externas antes de habilitarse.
- Ampliar el adapter con búsqueda oficial por external_reference para recuperar CREATE incierto/409 sin remote_id ni webhook; usar sus IDs solo como candidatos para GET validado, rechazando ambigüedad. Coste si es incorrecto: las limitaciones de búsqueda podrían requerir revisión manual y deben validarse en sandbox; no se rotará clave ni se habilitará entrega por un resultado de búsqueda.
