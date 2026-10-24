# Operación de tienda E5

Backend y Django Admin; la interfaz de tienda llegará en F3. Predeterminado: `SHOP_PAYMENT_PROVIDER=disabled`. La compra monetaria crea reserva local de 15 minutos y outbox; nunca hace HTTP dentro del checkout. El canje usa la billetera E4 y queda pagado en la misma transacción.

## Desarrollo aislado y demo

Usar siempre el proyecto `llaveextra-e5`, con sus volúmenes PostgreSQL/Redis propios. No ejecutar estas instrucciones sobre la base principal ni rotar sus cuentas. No se publican puertos al usar `run --no-deps`. Docker usa las dependencias bloqueadas de la imagen; reconstruir backend si cambió el lock.

```powershell
docker compose -p llaveextra-e5 up -d db redis
docker compose -p llaveextra-e5 build backend
docker compose -p llaveextra-e5 run --rm --no-deps backend python manage.py migrate
New-Item -ItemType Directory -Force work/e5-local | Out-Null
docker compose -p llaveextra-e5 run --rm --no-deps -v "${PWD}/work/e5-local:/e5-local" -e DEMO_CREDENTIALS_PATH=/e5-local/accounts.local.md backend python manage.py seed_demo
```

`seed_demo` requiere DEBUG. Las cuentas se describen por sus cuatro roles; los accesos generados quedan únicamente en `work/e5-local/accounts.local.md`, ignorado por Git. No usar `--recover-missing` ni copiar contraseñas al informe. El montaje propio evita sobrescribir `docs/cuentas-prueba.local.md`, que Compose también monta. Si una base aislada existente tiene cuentas sin el archivo correspondiente, el comando se detiene: recuperar su archivo local antes de continuar.

Obtener los IDs numéricos del Cliente activo/verificado y Administrador de la base aislada en su Admin o una consulta local, sin imprimir contraseñas. Para crear los productos/pedidos DEMO, reemplazar los placeholders por esos IDs; el comando exige selección explícita y no crea, verifica ni cambia cuentas.

```powershell
docker compose -p llaveextra-e5 run --rm --no-deps -v "${PWD}/work/e5-local:/e5-local" -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py seed_shop_demo --customer <ID_CLIENTE> --administrator <ID_ADMIN> --receipts /e5-local/receipts.local.txt
docker compose -p llaveextra-e5 run --rm --no-deps -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py process_shop_outbox --limit 100
docker compose -p llaveextra-e5 run --rm --no-deps -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py simulate_shop_payment <UUID_PEDIDO_MONEY> paid
docker compose -p llaveextra-e5 run --rm --no-deps -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py process_shop_outbox --limit 100
```

El seed crea un producto «DEMO — Llavero 3D», carga 20 unidades mediante ajuste delta auditado, acredita 500 créditos de prueba mediante E4 y genera un canje de 100 créditos y una reserva ARS. Repetirlo no renueva claves, saldo ni stock. Los recibos llevan «DEMO — SIN VALIDEZ FISCAL — SIN COBRO REAL» y no contienen cuentas. Si el retiro no existe crea «DEMO — Punto ficticio / Sin dirección real»; una configuración existente se conserva y debe estar habilitada. El UUID reservado de producto no puede sobreescribir un producto que no sea DEMO.

El fake persiste su estado en PostgreSQL entre procesos, no devuelve enlaces de pago y se rechaza en producción. Después de aprobar cancelación monetaria en Admin, ejecutar outbox: el fake reconoce el POST pero mantiene `REFUND_PENDING`. `simulate_shop_payment <UUID> refunded` simula la restitución externa; otro outbox confirma por GET y restituye stock una vez. `unknown` permite demostrar bloqueo/revisión. Ninguno de estos comandos llama a Mercado Pago.

## Ejecución periódica y recuperación

Programar en el entorno autorizado, con el mismo settings/proveedor en cada proceso:

| Comando | Frecuencia propuesta | Efecto |
| --- | --- | --- |
| `process_shop_outbox --limit 100` | Cada 10 segundos | Inbox firmado y luego CREATE/REFUND/RECONCILE pendientes |
| `expire_shop_orders --limit 100` | Cada minuto | Revalida reserva bajo lock y libera una sola vez |
| `reconcile_shop_orders --limit 100` | Cada minuto | Encola GET de todos los estados con referencia; incluye PAID/READY, cancelados/vencidos, entregados y reintegrados |

Cada comando termina después del lote; `--limit` admite 1–1000. Dimensionar frecuencia/lote según backlog. La reconciliación prioriza menor versión de observación para rotar cobertura. No hay scheduler desplegado automáticamente. La tabla `PaymentOperation` permite consultar intentos, disponibilidad, estado y código sanitizado en Admin; revisar operaciones BLOCKED, inbox sin vínculo e incidencias PAYMENT_REVIEW. El transporte tiene timeout de socket de 10 segundos, respuestas de hasta 256 KiB y redirecciones deshabilitadas. Lease de 60 segundos; un crash se recupera tras vencerlo. Backoff exponencial de 10 segundos a 1 hora, sin rotar claves. El token del lease, su generación y la versión global por pedido descartan respuestas obsoletas, incluso entre tipos distintos de operación.

CREATE conserva request/seller esperados congelados en `PaymentContext`, además del snapshot de dominio de Task 1. Reintenta con la misma clave. Tras un resultado desconocido busca por `external_reference` y rango RFC3339, limitado a 31 días; solo acepta cero o un candidato y siempre consulta su GET completo. Múltiples candidatos, paginación incompleta o un período mayor quedan en revisión; no elegir un candidato manualmente ni inventar una clave nueva. Para un 409, busca antes de decidir. Un webhook recibido antes de guardar el ID remoto se conserva en `PaymentInbox`, obtiene GET y solo vincula si referencia, vendedor, ARS/ARG e importe coinciden con un CREATE local. Luego agenda una observación nueva con fencing. Notificaciones sin vínculo se reintentan con backoff y no se borran.

Cambiar vendedor configurado bloquea operaciones de contratos antiguos. `disabled` detiene nuevas compras monetarias y llamadas de workers; los pedidos conservan sus claves y snapshots. Los errores permanentes 400/401/404, formatos desconocidos y discrepancias bloquean la operación o entrega. Revisar configuración/contrato y usar la acción «Reintentar operaciones bloqueadas» con motivo; conserva payload y clave. No editar tablas históricas ni marcar pagos manualmente.

Una revisión no extiende una reserva impaga. `Order.payment_confirmed` conserva si alguna vez un GET financiero íntegro confirmó el pago (o refund total) y PostgreSQL impide revertir esa marca. Mientras sea falsa, una reserva `PENDING_PAYMENT` o `PAYMENT_REVIEW` sin operación de refund puede vencer a los 15 minutos o cancelarse, tenga o no ID remoto. Batch y servicio usan la misma elegibilidad bajo locks; liberan una vez y conservan referencias, claves y auditoría de revisión. Si posteriormente se recupera CREATE y aparece un pago, pasa a revisión sin habilitar entrega ni reservar nuevamente. Un pedido antes PAID/READY, o con refund pendiente, conserva stock hasta GET de restitución total.

La migración nueva `shop.0005_payment_confirmation_history` reconstruye la marca con estados monetarios acreditados/reintegrados y auditorías inmutables de pago, incluido pago tardío observado en revisión. Un refund pendiente sin evidencia de pago sigue protegido por su estado/operación, sin inventar una confirmación. No modifica las migraciones 0001–0004, snapshots, claves ni cantidades. Aplicar mediante `manage.py migrate` en el entorno autorizado; la actualización desde 0004 con datos históricos se prueba sobre PostgreSQL. La base principal requiere su autorización operativa independiente.

## Estados y acciones

| Estado / observación | Acción y stock |
| --- | --- |
| PENDING_PAYMENT | Reserva local; GET concordante `processed/accredited` permite PAID antes de vencer |
| EXPIRED / CANCELED | Stock liberado una vez; referencia preservada y polling activo |
| Pago tardío o datos inconsistentes | PAYMENT_REVIEW; nunca permite entrega automática |
| PAID → READY → PICKED_UP | Solo Admin con motivo; solicitud abierta o cualquier operación REFUND bloquea |
| Cancelación aprobada, pendiente de pago o revisión nunca acreditada | CANCELED y libera reserva, incluso sin ID remoto; pago concurrente/tardío pasa a revisión |
| Cancelación aprobada, pagado o revisión de pago confirmado | REFUND_PENDING y outbox con clave propia; retiene stock asignado |
| Refund falla, timeout o POST 200 | No repone stock; reintento/reconciliación con las mismas claves |
| GET confirma refund completo | REFUNDED; IDs de refund únicos, pagos relacionados y sumas procesadas deben coincidir con total; stock una vez |
| Refund/chargeback externo tras PICKED_UP | Conserva entrega y stock; incidencia financiera auditada para Admin |

Una respuesta desconocida después de PAID/READY vuelve a revisión y bloquea retiro. La revisión no vuelve automáticamente a PAID aunque después aparezca un pago: Admin puede solicitar reintegro total con motivo. REFUNDED no regresa a PAID. El refund total exige raíz y pagos `refunded/refunded`, pagos íntegros y `total_paid_amount` igual al importe original, más refunds `processed` con suma exacta por `transaction_id`. Es el contrato conservador elegido para pruebas y está sujeto al gate sandbox; no asumir que `total_paid_amount` se convierte a cero.

## Webhook y gate externo

`POST /api/v1/shop/payments/webhook/?type=order&data.id=<ID>` exige `X-Request-Id` y `X-Signature`. HMAC SHA256 del manifest literal `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. No normaliza el ID ni el texto de timestamp. Admite 10 dígitos segundos o 13 milisegundos; máximo 10 minutos de antigüedad y 60 segundos futuros. Query máximo 512 caracteres, cuerpo máximo 8 KiB; parámetros firmados duplicados, discrepancias con body y firmas incorrectas devuelven 401 genérico. Devuelve 200 después de persistir la entrega, sin HTTP remoto. Dedupe por ID/request-id/ts; otra entrega del mismo ID vuelve a consultar. El redirect del navegador y el body nunca acreditan dinero. Configurar el proxy para no registrar firmas ni cuerpos; el polling recupera firmas legítimas viejas rechazadas.

Mercado Pago requiere selección `SHOP_PAYMENT_PROVIDER=mercadopago`, token y vendedor esperados en `SHOP_MP_ACCESS_TOKEN` / `SHOP_MP_SELLER_ID`, secreto `SHOP_MP_WEBHOOK_SECRET` y habilitación explícita `SHOP_MP_SANDBOX_VERIFIED=true`. `.env-example` contiene solo valores vacíos. No se leyeron ni usaron credenciales externas durante E5. La bandera se habilita únicamente en un entorno de validación controlado con cuentas de prueba; su uso posterior en producción requiere evidencia sandbox completada y autorización operativa.

Antes de habilitar operación real, completar con vendedor/comprador de prueba y credenciales de la aplicación de esas cuentas: CREATE, URL argentina HTTPS, GET seller/ARS/ARG/importes y `live_mode`, pago, búsqueda por referencia tras respuesta perdida, firma/casing/ts y retries, vencimiento local/pago tardío, refund total y GET final. Orders no admite el token TEST tradicional según su referencia: no inferir entorno por prefijo de token. No introducir secretos en chats ni versionarlos. Documentar los campos reales devueltos, verificar el contrato conservador y corregirlo con pruebas si difiere; nunca saltar checks para hacer pasar una respuesta inconsistente. El vencimiento remoto de 15 minutos y la renovación del timestamp en retries siguen pendientes de comprobar.

Fuentes oficiales: [CREATE](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/create-order/post), [GET](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get), [búsqueda](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/search-orders/get), [refund](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/refund-order/post), [notificaciones Orders](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod), [validador oficial](https://github.com/mercadopago/sdk-python/blob/master/mercadopago/webhook/validator.py). Las fixtures propias corrigen inconsistencias de ejemplos públicos y solo prueban el contrato local. Ver [evidencia E5](verification/05-tienda-pagos.md).
