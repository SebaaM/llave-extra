# Plan E5 — Tienda y pagos

**Goal:** entregar catálogo de regalería 3D, pedidos propios, canjes seguros, reserva monetaria y operaciones recuperables de Mercado Pago en backend y Django Admin.

**Architecture:** aplicación Django `shop`, PostgreSQL como autoridad de stock/pedidos/outbox, billetera E4 reutilizada; HTTP externo fuera de atomic, API DRF versionada y adaptador real aislado de simulador durable. No interfaz de tienda en esta etapa.

**Tech Stack:** Django/DRF, PostgreSQL 17, Redis, uv bloqueado, Docker Compose; sin nuevas dependencias salvo necesidad justificada.

**Spec:** [reglas vinculantes E5](05-tienda-pagos-spec.md), [créditos E4](04-consumos-creditos.md) y CONTEXT.md. El pedido vigente revoca la pausa anterior y autoriza E5; E6/F3 quedan después.

## Global Constraints

- Exactamente cuatro roles, acceso servidor y registro público TOURIST; sin cambios a la privacidad o frontend vigente.
- User → Wallet → Order → Product ordenados; sin HTTP en atomic. Servicios E4 para débito/reintegro, sin escribir libro directamente.
- Idempotencia local durable actor/operación/clave+fingerprint, externa estable por operación y payload; ninguna reserva/cargo nuevo por timeout.
- Stock/precios/totales protegidos por BD, snapshots inmutables, ajuste delta con lock y razón. No edición de estado/importes/historia en formularios.
- Dinero/stock liberados solo bajo estados confirmados; pago tardío después de liberar no habilita entrega. Fakes bloqueados en producción, ningún cobro real.
- GitFlow feature → develop, Conventional Commits en español, no merges. Mantener API/OpenAPI/contexto/ToDo y evidencia.
- Pruebas solo PostgreSQL/Redis aislados; no reseed ni rotación de credenciales de la base principal. Trabajadores no crean agentes ni revisores.

## Review Focus

1. Reintento concurrente o después de timeout/vencimiento conserva un pedido, una reserva/débito y clave externa (Tasks 1/2).
2. Pago confirmado tras cancelación/vencimiento no reutiliza stock liberado; refund fallido no lo repone (Task 2).
3. Locks compartidos con E4, ajuste delta vs checkout y concurrencia del último stock (Task 1).
4. Mismo ID remoto recibe PAID y REFUNDED; firma correcta no vuelve confiable el body (Task 2).
5. Worker duplicado/lease vencido, error remoto y snapshot de request impiden doble operación y escrituras obsoletas (Task 2).

## Task 1: Dominio, catálogo, pedidos y canjes

**Files:** crear `backend/shop/{apps,models,services,serializers,views,urls,admin,media}.py`, migraciones, módulos de dominio acotados y `backend/shop/tests/`; actualizar settings/urls, docs/api.md y OpenAPI. Puede subdividir servicios/lifecycle/stock para mantener responsabilidades claras.

**Interfaces:**

- `shop.services.checkout(user_id, *, mode, items, idempotency_key)` devuelve `(order, created)`; items canónicos con `product_id` y `quantity`, mode `CREDITS` o `MONEY`.
- `shop.services.request_cancellation(user_id, order_id, *, reason)` crea/reutiliza solicitud propia abierta; acciones administrativas tipadas para aprobar/rechazar con razón, preparar/entregar y ajuste delta de stock. Firma exacta final documentada en informe para Task 2.
- API `/api/v1/shop/products/` y medios públicos revalidados por producto activo; `/orders/`, `/orders/{uuid}/` y `/orders/{uuid}/cancel/` propios. Solo Cliente activo/verificado en escrituras.
- Modelos Product, ShopSettings de retiro, Order, OrderLine, CheckoutKey, CancellationRequest, auditoría/ajuste; PaymentOperation durable CREATE/REFUND/RECONCILE con clave/carga/lease. Money checkout reserva 15 minutos y crea outbox atómico; no ejecuta HTTP ni se habilita sin proveedor configurado. Task 2 consume/extiende contratos internos documentados.

- [x] Tests PG del catálogo sin datos privados, roles/IDOR/tampering, snapshots y constraints; canje exitoso/saldo insuficiente/congelado con rollback; carrito y cantidades acotados.
- [x] Implementar checkout con lock/fingerprint/idempotencia, reserva monetaria + outbox y canje E4; sin HTTP. Pruebas conexiones paralelas: misma clave, último stock, créditos y carritos en orden inverso, ajuste administrativo vs checkout.
- [x] Implementar cancelación de créditos idempotente, solicitud/rechazo propios y acciones preparar/entregar; bloquear retiro si solicitud abierta. Admin seguro en español: stock readonly+delta, snapshots/historia sin edición/borrado, retiro configurable e imágenes validadas.
- [x] Actualizar contrato y ejecutar Ruff, PG tests relevantes, makemigrations --check y schema --validate --fail-on-warn; registrar resultado y commit español. Revisión independiente antes de Task 2.

## Task 2: Pagos, reconciliación y entrega operativa

**Files:** crear `backend/shop/payments/` (contratos, Mercado Pago, simulador), outbox/reconciliación/webhooks, comandos `process_shop_outbox`, `reconcile_shop_orders`, `expire_shop_orders`, `seed_shop_demo` y simulación de estados; tests PG/contrato; ampliar admin/urls/settings/.env-example/compose cuando corresponda; docs API/OpenAPI, este plan, contexto/ToDo y `docs/verification/05-tienda-pagos.md`.

**Interfaces:** gateway con `create_order(payload, *, idempotency_key)`, `get_order(remote_id)` y `refund_order(remote_id, *, idempotency_key)`; DTO tipado conserva IDs/importe/estado/checkout_url y errores sanitizados. Los servicios de Task 1 son autoridad local. Comandos limitados por batch, leases/fencing y backoff; firmas finales y ejecución en guía operativa.

- [x] Implementar adapter real según fuentes oficiales de spec, URL fija/TLS/no redirects, timeout/bounds y allowlist checkout; fake persistente DEMO bloqueado en producción. Tests contractuales de request/headers/campos/errores, no llamadas monetarias externas.
- [x] Implementar outbox recuperable y observación GET autoritativa con todos los cotejos; HTTP fuera de atomic. Vencimiento y cancelación conservan referencias, stock una vez, late pay → revisión/refund. Refund clave propia estable, GET confirma restitución antes de reponer stock.
- [x] Webhook HMAC literal query/ts, bounds/age/dedupe durable/ack rápido; mismo data.id se vuelve a consultar. Tests de firma, payload, replay, paid→refund, errores de vinculación y estados inconsistentes.
- [x] Acciones Admin auditadas para pago tardío/refund/reintento sin eludir estados; pruebas races de workers, expiry/webhook/cancel, refund fallo→confirmación, crash/lease y pickup bloqueado.
- [x] Seed productos/pedidos/comprobantes DEMO idempotentes y documentación breve de arranque/cuentas sin secretos. Operación/schedule, tabla de estados, sandbox pendiente y qué se probó realmente. No reseed de la base principal.
- [ ] Ejecutar suite backend completa PG/Redis, Ruff, migraciones y esquema; revisión de rama independiente (puede ser gate Task 2), una ola consolidada de fixes y re-review focal. CI del HEAD, PR propio → develop, adjuntar sin fusionar. Detenerse antes de E6/F3.

## Evidencia y decisiones

Preflights de billetera/código y documentación oficial revisados el 20/10/2026; no se usaron credenciales ni se ejecutaron pagos. El informe final distinguirá adapter probado con fixtures de sandbox real. La verificación de UI de tienda no aplica al alcance backend aprobado.

Task 1 aprobada en `a7a6b59`; Task 2 producto y verificación local implementados el 24/10/2026. Búsqueda por referencia añadida al adapter para recuperar CREATE incierto sin webhook. La casilla final sigue pendiente porque reúne gate independiente, PR y CI a cargo del orquestador. Evidencia exacta en docs/verification/05-tienda-pagos.md; no se validó sandbox externo.
