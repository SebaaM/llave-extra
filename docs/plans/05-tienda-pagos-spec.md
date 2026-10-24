# E5 — Tienda, pedidos y pagos

Autorizado por el plan original y por «arranca la siguiente etapa» el 20/10/2026. Recupera las reglas financieras aprobadas del brief E5; no cambia los cuatro roles ni la privacidad de recomendaciones. Implementación: [plan E5](05-tienda-pagos.md).

## Alcance y experiencia

Backend/API y Django Admin para regalería 3D. Catálogo público de productos, compra íntegra en ARS con Mercado Pago o canje íntegro en créditos; sin pagos mixtos ni envíos. Retiro en un punto configurable, conservado como snapshot del pedido. Solo un Cliente TOURIST activo y con email verificado puede comprar, canjear o solicitar cancelación de sus pedidos. Administrador opera la tienda; Prestador y Colaborador no adquieren permisos administrativos. La interfaz de tienda se conecta en F3, conservando ahora el frontend aprobado.

Productos con UUID, nombre, descripción, imagen validada, activo, stock no negativo y precios independientes: decimal positivo ARS y entero positivo en créditos. Puede deshabilitarse cada modalidad, manteniendo al menos un precio. Carrito acotado, cantidades enteras positivas y totales calculados exclusivamente en el servidor. Rechazar campos desconocidos, importes, moneda o privilegios aportados por el cliente. Ningún dato de carpeta, comercio o QR privado se incluye en el catálogo de productos.

## Consistencia y autorización

- Snapshot inmutable de líneas, nombres, precios, cantidades, totales, moneda, cliente y retiro. Editar un producto o el punto de retiro solo afecta pedidos futuros.
- Orden global de locks: **User → Wallet → Order → Product**, productos ordenados por PK. Workers pueden leer el ID de cliente sin lock antes de adquirir y revalidar las filas en ese orden. HTTP nunca dentro de atomic. No escribir saldo/libro desde tienda: usar `credits.services.debit_wallet(tourist_id, amount, reference)` y `refund_wallet(tourist_id, amount, reference, *, debit_reference)` dentro de atomic externo.
- Idempotencia durable por actor/operación/Idempotency-Key y fingerprint canónico de carrito/modalidad. Confirmar clave, pedido, líneas, débito o reserva y outbox en una transacción. Misma clave/carga devuelve el pedido actual y URL disponible, también tras timeout o vencimiento. Carga distinta: 409. Concurrencia PostgreSQL debe probar un único efecto.
- Canje empieza PAID y debita créditos/stock atómicamente. Saldo insuficiente o billetera congelada revierte todo. Stock no puede ser negativo ni venderse dos veces.
- Stock de compra monetaria reservado **15 minutos locales**. Vencimiento libera una vez. No se afirma un vencimiento remoto de 15 minutos: no está confirmado en documentación de Mercado Pago.
- Stock administrativo no editable como valor absoluto en formulario común: ajuste delta con lock, motivo y auditoría. Historial financiero inmutable/no eliminable, acciones mediante servicios autorizados.

## Estados y cancelación

| Situación | Resultado permitido |
|---|---|
| Compra monetaria creada | PENDING_PAYMENT, reserva y CREATE en outbox |
| Canje confirmado | PAID, débito y stock en la misma transacción |
| GET autoritativo confirma pago íntegro antes del vencimiento | PAID |
| Reserva vencida | EXPIRED, stock liberado una vez |
| Pago después de vencimiento/cancelación o stock liberado | PAYMENT_REVIEW; nunca PAID/READY automático |
| Administrador prepara / entrega | PAID → READY → PICKED_UP, sin cancelación/refund pendientes |
| Cliente pide cancelación | Solicitud propia antes de entrega; bloquea retiro mientras se revisa |
| Administrador rechaza | Motivo/auditoría, conserva estado y asignación |
| Administrador aprueba canje | CANCELED y reintegro vinculado al débito original; stock una vez |
| Aprueba compra pendiente | CANCELED, libera reserva una vez; conserva referencia remota y reconcilia pagos tardíos |
| Aprueba compra ya pagada o resuelve pago tardío | REFUND_PENDING, outbox de refund estable; retiene stock aún asignado |
| Refund falla o es desconocido | Pendiente/fallido/revisión explícitos; retiro bloqueado, sin restaurar stock asignado |
| GET confirma refund total | REFUNDED, libera stock asignado una vez |

Estados operativos adicionales pueden distinguir fallo/revisión sin eludir estas reglas. No hay PATCH genérico de estado, cancelación posterior a entrega, reembolso parcial ni edición libre de importes. Cancelación requiere motivo administrativo; las transiciones y ajustes conservan actor/fecha/auditoría.

## Operaciones remotas recuperables

Outbox durable con clave externa UUID estable por CREATE y otra por refund; payload original persistido, intentos, lease recuperable y fencing. Varias ejecuciones/workers no producen operaciones lógicas duplicadas. Timeout/desconexión/5xx/423/429 conservan clave y carga con backoff; nunca se rota clave para escapar de resultado desconocido. 409 exige reconciliar antes de decidir; 400/401/404 y respuestas desconocidas quedan bloqueadas o en revisión, sin conceder producto. Cancelación/vencimiento concurrentes no borran referencias ni resultados remotos recibidos posteriormente.

Comandos idempotentes para despachar outbox, reconciliar y vencer reservas, documentados con frecuencia y recuperación de leases. Persistir identificadores/códigos sanitizados, sin tokens, firmas ni payload sensible en logs. Reconciliar también sin webhook; no depender del redirect del navegador.

## Contrato Mercado Pago y simulador

Fuentes oficiales revisadas el **20/10/2026**:

- [Crear Checkout Pro Orders](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order?scope=prod): POST `/v1/orders`, manual, `external_reference` UUID local, importes en cadenas, `X-Idempotency-Key`. Guardar `id` y `checkout_url` de CREATE; GET puede omitir la URL.
- [GET Order](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get): `id`, `external_reference`, `user_id` vendedor, `country_code`, `currency`, `total_amount`, `total_paid_amount`, `status/status_detail`, `transactions.payments[]`. Cotejar todos con pedido/configuración; exigir raíz y pagos concordantes `processed/accredited`, importes íntegros y ARS/ARG. Ejemplo público internamente inconsistente: no copiarlo como fixture válida. Parcial, sobregiro, importe discordante o estado desconocido → revisión.
- [Refund total](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/refund-order/post): POST `/v1/orders/{id}/refund`, clave estable y body de refund total. HTTP 200 por sí solo no confirma restitución; GET autoritativo debe concordar con refund completo.
- [Notificaciones Orders](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod) y [SDK Python oficial](https://github.com/mercadopago/sdk-python/blob/master/mercadopago/webhook/validator.py): HMAC-SHA256 hexadecimal de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Conservar casing de query `data.id` y texto literal de ts; no aplicar reglas de otro producto ni probar dos HMACs.

Ruta webhook dedicada a tópico order; exigir query firmado único, headers bien formados y tamaño acotado, comparación constante y errores genéricos. Si el cuerpo aporta ID, debe coincidir; nunca sustituye al query firmado. Admitir epoch de 10 dígitos en segundos o 13 en milisegundos, sin modificar el texto firmado; antigüedad máxima 10 minutos y desfase futuro máximo 60 segundos. Firma vieja se rechaza; reconciliación periódica recupera notificaciones legítimas tardías. La renovación de ts en retries de Mercado Pago sigue siendo un punto de sandbox.

Ack rápido después de autorización y encolado durable. El cuerpo no confirma dinero: solo dispara GET autenticado a la ruta fija del ID firmado. `data.id` identifica el pedido remoto, **no** un evento: posteriores notificaciones del mismo ID deben volver a consultar (por ejemplo PAID y luego REFUNDED). Dedupe de entrega si existe identidad, aplicación idempotente de observaciones bajo lock. No aceptar URLs remotas del cliente, redirects HTTP con Authorization ni checkout_url ajena a HTTPS/dominios argentinos explícitos de Mercado Pago.

Adaptador con HTTP timeout/response-size bounds y DTOs estrictos; fake claramente DEMO para desarrollo/pruebas y bloqueado en producción. Configuración real explícita, secretos solo en entorno, `.env-example` vacío. Sin cobros reales, despliegue ni credenciales productivas. El simulador debe conservar estado entre comandos para demostrar reintentos/reconciliación local. Configuración de retiro ausente bloquea checkout.

**Gate externo:** las pruebas del adapter con fixtures/simulador no validan interoperabilidad con Mercado Pago. Antes de habilitarlo operativamente, sandbox de test debe confirmar CREATE, URL, seller/moneda/país, estados raíz/transacciones, firma/casing/ts, reintentos, expiración y refund total. Si faltan credenciales, entregar código probado y procedimiento con limitación expresa.

## Entrega y pruebas

PostgreSQL/Redis reales: autorización por rol/ownership, tampering, snapshots, stock/credit canjes concurrentes, idempotencia/replay tras timeout/vencimiento, ajuste stock vs checkout, cancelación/refund una vez, worker duplicado/crash, webhook pago→refund con mismo ID, firmas inválidas/viejas, ownership/importes/estados remotos erróneos y carreras vencimiento/cancelación/pago. Datos y comprobantes DEMO idempotentes sin sobrescribir registros reales. Migraciones, Ruff, suites completas y OpenAPI sin drift. Documentar comandos/resultados, operación y cuentas locales sin versionar secretos.

GitFlow: `feature/tienda-pagos` desde la base revisada de PR #10 (`9f8f56d`), PR propio a develop dependiente de #10 mientras siga abierto. No fusionar. E6 y frontend de tienda esperan otra etapa.
