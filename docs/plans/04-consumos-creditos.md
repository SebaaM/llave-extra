# E4: consumos, progreso y créditos

## Regla de negocio

Cliente es el nombre de producto del rol técnico `TOURIST`. Solo un Cliente activo y con email verificado puede acreditar el consumo de un Prestador publicado que tenga al menos un beneficio publicado y vigente. El consumo directo no requiere carpeta y conserva `collaborator_id=null`. Si el Cliente aporta `folder_id`, la referencia debe seguir vigente y el Prestador debe pertenecer a esa carpeta; una referencia inválida nunca se convierte en consumo directo. El QR del Colaborador concede acceso a la carpeta; el QR del Prestador identifica el comercio para un consumo y exige además su PIN fijo. Ninguno de los dos reemplaza el inicio de sesión. El interruptor del catálogo público solo controla su visibilidad y no bloquea consumos presenciales.

Cada par Cliente/Prestador recibe una sola acreditación durante todo el programa, incluso si luego se anula. PostgreSQL impone la unicidad. La primera visita válida suma uno al progreso y acredita el valor vigente: 1.000 créditos globales iniciales o la regla específica del Prestador. Un override de `0` es válido y se distingue de la ausencia de override; produce una visita sin movimiento de créditos. El objetivo global inicial es cinco visitas, editable de 1 a 1.000. El valor de la regla y el objetivo al momento del consumo quedan en `rule_snapshot`; cambios posteriores no reescriben el historial. No hay premio adicional al completar el objetivo ni vencimiento de créditos en el MVP.

El Admin configura regla global y overrides, registra o rota QR/PIN y gestiona anulaciones mediante acciones auditadas. El titular Prestador puede establecer su propio PIN y obtener su QR en su endpoint protegido; no puede acceder al de otro Prestador. El PIN se guarda con el hasher de Django y nunca se devuelve. El QR de consumo usa un salt de firma propio y versión persistida. Rotar la versión invalida nuevos consumos con QR anteriores.

## API versionada

Todas las rutas siguientes exigen bearer JWT salvo que se indique un error `401`; contienen `Cache-Control: no-store` y `Referrer-Policy: no-referrer`, incluidos los errores. El esquema generado vive en `/api/schema/` y la documentación interactiva en `/api/docs/`.

| Ruta | Método | Solicitud | Respuesta |
| --- | --- | --- | --- |
| `/api/v1/consumptions/` | `POST` Cliente | Header `Idempotency-Key` (1–128 caracteres visibles); JSON `folder_id` UUID opcional o `null`, `qr_token`, `pin` de 6–12 dígitos | `201`: `id`, `provider_id`, `collaborator_id` UUID o `null`, `award`, `balance`, `state`, `created_at` |
| `/api/v1/me/wallet/` | `GET` Cliente | — | `200`: `balance`, `redemptions_frozen` |
| `/api/v1/me/consumptions/` | `GET` Cliente | — | `200`: lista propia con `id`, `provider_id`, `collaborator_id` UUID o `null`, `award`, `state`, `created_at` |
| `/api/v1/me/progress/` | `GET` Cliente | — | `200`: `total` de consumos válidos, `target` vigente y `completed`; `total` puede exceder `target` |
| `/api/v1/provider/providers/{provider_id}/consumption-credential/` | `GET` titular Prestador | — | `200`: `configured` y `qr_url` si hay PIN |
| misma ruta | `PUT` titular Prestador | JSON `pin` de 6–12 dígitos | `200`: `configured: true` |

`POST` responde `400` ante QR, PIN o datos mal formados; `401` sin sesión; `403` si rol, email, referencia aportada, Prestador o beneficio dejan de habilitar el consumo; `409` si la clave se reutiliza con otros datos o el par Cliente/Prestador ya tiene historial; `429` ante exceso de intentos o Redis no disponible. Las cuotas compartidas por origen confiable, cuenta y cuenta/Prestador se configuran con `RATE_CONSUMPTION_MAX` (8) y `RATE_CONSUMPTION_WINDOW` (300 segundos). El origen usa el resolver de E2 y solo acepta el encabezado saneado cuando proviene del proxy configurado. Los tokens y PIN no se registran en logs.

La respuesta confirmada se guarda en la misma transacción que el consumo, saldo y libro de movimientos. Un reintento del mismo Cliente activo, misma clave y mismo cuerpo devuelve exactamente la respuesta confirmada antes de comprobar la vigencia actual del QR o PIN. La huella del cuerpo es HMAC con clave del servidor; no guarda el PIN ni un hash enumerable. Omitir `folder_id` y enviarlo como `null` son equivalentes; una clave usada en modo directo no se puede reutilizar en modo referido, ni viceversa. Una clave distinta para un consumo ya registrado devuelve `409`, sin segunda acreditación ni atribución inventada.

## Saldo, anulación y ajustes

`Wallet` mantiene un saldo no negativo por Cliente y un bloqueo de canjes. `WalletEntry` agrega movimientos firmados con UUID y referencia de negocio única: `EARN`, `REDEEM`, `REFUND`, `REVERSAL` o `ADJUSTMENT`. Un trigger PostgreSQL impide editar o borrar movimientos; otro protege atribución, monto y borrado de consumos, incluso las transiciones hacia o desde `collaborator_id=null`. El saldo y el movimiento se escriben en una transacción. El orden de locks es Usuario → perfil de Colaborador cuando hay referencia → Prestador → beneficio vigente → regla → Wallet para acreditar; Usuario → Wallet → consumo/caso para anular o resolver. Revocar carpeta, quitar pertenencia, despublicar Prestador o retirar el último beneficio vigente se serializa con la acreditación.

La acción de anulación exige Admin y motivo. Si hay saldo suficiente, registra una reversión completa. Si no lo hay, deja un caso pendiente y congela canjes, sin producir saldo negativo. La resolución requiere Admin, motivo y una de tres vías: reversión completa cuando el saldo ya alcanza; aporte auditado de la diferencia y reversión completa; o condonación auditada del faltante, con reversión del saldo disponible. El bloqueo se retira solo cuando no quedan casos pendientes. Gastar créditos y anular consumos no borra visitas históricas; solo los consumos `VALID` cuentan en el progreso.

Las acciones Admin muestran consumos, saldo, libro y casos en modo lectura; la edición y borrado estándar de movimientos/consumos están deshabilitados. El valor de regla admite cero, con límite de 1.000.000 por acreditación. Las anulaciones y resoluciones muestran resultado y error por fila seleccionada.

## Demo y operación

`seed_demo` continúa protegido por `DEBUG=True` y crea una sola vez tres Clientes verificados, cuatro consumos de ejemplo y un caso pendiente con canjes congelados, cuando la carpeta y tres Prestadores demo siguen habilitados. Genera PIN aleatorios y los escribe junto con las credenciales en `docs/cuentas-prueba.local.md`, ignorado por Git. No restablece PIN, publicaciones, asignaciones ni cuentas modificadas al repetirse; si los datos necesarios cambiaron, omite el escenario. En una base descartable se debe configurar una ruta propia para `DEMO_CREDENTIALS_PATH` antes de ejecutarlo.

El PIN fijo se puede compartir o mostrar fuera del local; el QR+PIN no prueba presencia física por sí solo. Rotar ambos y revisar anomalías son controles operativos. La validación de Mercado Pago y los canjes de tienda pertenecen a E5; E4 solo entrega el servicio transaccional de saldo.
