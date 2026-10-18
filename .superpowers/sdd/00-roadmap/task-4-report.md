# Task 4 — E4 consumos y créditos

## Resultado y requisitos

Se implementó la acreditación única de por vida por Cliente (`TOURIST`) y Prestador, mediada por QR de consumo firmado y versionado, PIN fijo hasheado, email verificado, carpeta vigente de Colaborador y pertenencia del Prestador publicado. El servidor usa `providers.access.locked_provider_eligibility`, que conserva los locks E2/E3 `User → CollaboratorProfile → Provider` durante toda la acreditación. La restricción PostgreSQL única `(tourist, provider)` incluye consumos anulados. El QR de consumo utiliza salt distinto del QR de referencia; el cliente no puede acreditar indicando solo un UUID de Prestador.

La política global empieza en 1.000 créditos y meta de cinco visitas. `ProviderCreditRule.reward` admite `0` como override explícito y `None` por ausencia de fila; ambos caminos se prueban. Los valores se limitan a 1.000.000 por acreditación y meta 1–1.000 tanto en Admin/modelos como en restricciones de base. Cada consumo guarda monto, origen de regla y meta histórica. No hay bono de meta ni vencimiento de créditos. `GET /me/progress/` cuenta solo consumos válidos y permanece independiente del gasto.

La idempotencia durable usa `(actor, operation, key)` único y HMAC del cuerpo con clave del servidor; el PIN no se almacena en claro ni como hash enumerable. Una respuesta confirmada se lee después de verificar que el actor sigue activo, antes de validar QR/PIN, accesos o consumir cuotas Redis. La misma clave y cuerpo devuelve el mismo JSON y `201`, incluso luego de rotación; la misma clave con otro cuerpo devuelve `409`. Otra clave para el mismo par Cliente/Prestador devuelve `409` sin doble saldo. Las cuotas Redis por origen confiable E2, cuenta y cuenta/Prestador fallan cerrado.

El libro `WalletEntry` usa UUID, delta firmado, tipo, referencia de negocio única y vínculo al débito original para reintegros. Saldo y entrada comparten transacción. PostgreSQL restringe saldo no negativo, tipo/signo y origen del reintegro, e impide UPDATE/DELETE de entradas con trigger. Anulación mediante Admin y motivo conserva el consumo, registra reversión cuando alcanza el saldo o abre caso pendiente y congela canjes. Resolución con motivo usa reversión posterior, aporte del faltante más reversión, o condonación auditada del faltante y reversión del saldo disponible. El caso conserva el faltante inicial y audita aporte/condonación efectiva; el bloqueo solo se levanta cuando no quedan casos pendientes. Un trigger impide editar atribución, monto, snapshot o borrar consumos históricos.

La escritura de saldo y entrada usa un savepoint interno: si otra wallet gana una carrera por la misma referencia, se revierte el saldo local y se devuelve el movimiento coincidente o un conflicto sin crédito parcial.

Admin configura política y overrides, PIN y rotación QR; consulta consumo, wallet, libro y ajustes en vistas de solo lectura. Las acciones de anular y resolver exigen motivo. El Prestador titular puede cambiar su PIN y consultar su QR protegido. Los listados y serializadores no devuelven hashes ni PINs. La API de Cliente solo expone saldo, consumos y progreso propios; respuestas y errores sensibles usan `no-store` y `no-referrer`.

`seed_demo` incorpora tres Clientes verificados, cuatro acreditaciones y un caso congelado mediante servicios de dominio, idempotentemente. Los PIN aleatorios solo se escriben en la ruta local ignorada de credenciales. Omite el escenario E4 si la carpeta, los Prestadores demo, sus reglas/PIN o los Clientes de ejemplo fueron personalizados; no restablece datos. Para pruebas se usaron rutas temporales, sin escribir credenciales en el archivo demo principal.

## Migraciones

- `credits.0001_initial`: políticas, credencial de Prestador, wallet, libro, consumo, idempotencia y ajustes; unicidad y límites iniciales.
- `credits.0002_consumption_consumption_annul_audit_complete`: coherencia de estado y auditoría de anulación.
- `credits.0003_policy_and_immutable_history`: política inicial y triggers PostgreSQL de historial inmutable.
- `credits.0004_walletentry_source_entry`: vínculo reintegro→débito.
- `credits.0005_adjustmentcase_forgiven_amount_and_more`: faltante inicial, aporte/condonación y auditoría de resolución.
- `credits.0006_walletentry_wallet_entry_kind_sign_source`: coherencia entre tipo, signo y vínculo del movimiento.

## Contrato para E5

Importar de `credits.services`:

```python
debit_wallet(tourist_id, amount: int, reference: str) -> WalletEntry
refund_wallet(tourist_id, amount: int, reference: str, *, debit_reference: str) -> WalletEntry
```

Ambas funciones requieren una transacción `transaction.atomic()` externa. E5 debe reservar una referencia de negocio estable y única por débito o reintegro, y usar las funciones dentro de la misma transacción del pedido. `debit_wallet` exige Cliente activo con email verificado, saldo suficiente y canjes no congelados; reintentos con igual referencia/monto regresan el movimiento confirmado. `refund_wallet` admite reintegro a una wallet congelada, exige el débito original de esa wallet y limita la suma de reintegros al importe debitado. Un conflicto de referencia/datos o saldo devuelve `credits.services.Conflict` (`409`). Orden de locks en E5: `User → Wallet → pedido → stock`, sin adquirir antes locks de pedido o stock. E4 acredita con `User → CollaboratorProfile → Provider → CreditPolicy/ProviderCreditRule → Wallet`; anulaciones/resoluciones usan `User → Wallet → Consumption/AdjustmentCase`. No usar escrituras directas a `Wallet.balance` ni `WalletEntry` desde la tienda.

## Verificación efectiva

Proyecto aislado `llaveextra-acceptance8`: PostgreSQL 17 y Redis sanos. La imagen backend se reconstruyó con `docker compose -p llaveextra-acceptance8 build backend`, sin usar el proyecto demo principal. Los comandos de Django y pytest se ejecutaron con `docker compose -p llaveextra-acceptance8 run --no-deps --rm backend ...`; `--no-deps` evitó iniciar Mailpit porque el puerto local 8025 ya estaba ocupado por otro entorno, mientras PostgreSQL y Redis del proyecto aislado seguían saludables.

| Comando backend dentro del contenedor | Resultado |
| --- | --- |
| `python manage.py migrate --noinput` | Migraciones E4 0001–0006 aplicadas correctamente a PostgreSQL aislado. |
| `python manage.py makemigrations --check --dry-run` | `No changes detected`. |
| `python manage.py check` | `System check identified no issues (0 silenced)`. |
| `python manage.py spectacular --validate --fail-on-warn --file /tmp/e4-openapi.yaml` | Salida 0; esquema sin warnings. |
| `pytest -q` | `63 passed in 241.99s` sobre PostgreSQL/Redis reales. Una corrida previa terminó `62 passed, 1 failed` por la expectativa E1 de siete cuentas demo; se actualizó a `len(DEMO_ACCOUNTS)` y la repetición completa pasó. |
| `pytest -q accounts/tests/test_user.py::test_seed_demo_is_idempotent_and_keeps_existing_password providers/tests/test_providers.py::test_seed_is_initial_only_and_preserves_admin_changes credits/tests/test_credits.py::test_seed_creates_idempotent_verified_and_frozen_demo` | `3 passed in 51.62s` tras proteger el seed ante reglas personalizadas. |
| `pytest -q credits/tests/test_credits.py` | `13 passed in 107.56s` tras cerrar la colisión de referencias financieras entre wallets. |
| `ruff check .` | Sin errores tras retirar un import no usado. |
| `git diff --check` | Sin problemas de espacios. |

Las pruebas E4 cubren QR/PIN inválidos y rotados, roles y email, ausencia/rotación de acceso, Prestador ajeno, ownership, regla global y override cero, snapshot, unicidad de por vida, idempotencia y conflicto, cuota Redis fail closed, saldo/libro, anulaciones, casos múltiples, funding/forgiveness, permisos Admin y vistas propias. Las carreras de dos acreditaciones y débitos paralelos usan conexiones PostgreSQL independientes; la prueba de revocación comprueba con `pg_blocking_pids` que la acreditación espera el lock, y otra prueba cruza acreditación con resolución.

No se tocó el frontend. Beneficios + Pasaporte sigue siendo la dirección confirmada para F2, ahora programado después de E4 revisado. La integración real con Mercado Pago y el stock pertenecen a E5. El PIN fijo puede compartirse; QR+PIN no demuestra presencia física por sí solo.
