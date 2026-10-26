# Checklist de seguridad

Fecha inicial: 24/10/2026. Estado: **NO INICIADA**. Incluye 85 controles agrupados que se expandirán por endpoint y caso. Esta lista fue preparada como parte del plan; no acredita que la aplicación haya superado ninguno de estos controles.

Plan: [auditoría](../superpowers/plans/2026-10-24-auditoria-seguridad.md). Registro: [hallazgos](hallazgos.md). Inicio/reanudación: [prompt del auditor](prompt-auditor.md).

## Cómo registrar las comprobaciones

Cada fila agrupa controles de una feature; el inventario de Task 1 los expande por endpoint, método, actor, objeto y variante en casos `CAS-<control>-NNN`. Un test existente no marca la fila como chequeada. Requiere ejecución nueva y evidencia del corte.

- **Chequeado:** `NO`, `PARCIAL` o `SI`. `SI` solo si se ejecutaron todos sus casos aplicables.
- **Resultado:** `PENDIENTE`, `EN_CURSO`, `PASS`, `FAIL`, `BLOQUEADO` o `NO_APLICA` con motivo revisado. Un control corregido pasa únicamente tras reejecución/revisión; conserva vínculo al hallazgo.
- **Hallazgo:** `NO_EVALUADO` inicialmente; `NINGUNO` solo tras ejecución; uno o más IDs `SEC-NNN` si se encontró un problema. Corrección no borra el ID.
- **Solución / evidencia:** IDs de casos y links a corrida, fix/commit y revisión. `—` significa todavía sin evidencia, nunca «sin problemas».

Si solo se comprobó parte, queda `PARCIAL`; si algo falla se refleja `FAIL` aunque falte cobertura. Bloqueos requieren motivo, responsable y siguiente acción. `NO_APLICA` requiere evidencia de ausencia o política explícita; no se usa para un fallo difícil de resolver.

## E1: base, configuración y exposición

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| B01 | Inventario completo de rutas, métodos, comandos, Admin, medios y superficies fuera de OpenAPI | NO | PENDIENTE | NO_EVALUADO | — |
| B02 | Entorno auditado aislado: PG/Redis/SMTP/storage, claves, cuentas y puertos propios | NO | PENDIENTE | NO_EVALUADO | — |
| B03 | Producción rechaza claves vacías/compartidas, DEBUG y configuración insegura según requisitos | NO | PENDIENTE | NO_EVALUADO | — |
| B04 | Host/proxy: headers de cliente falsificados no evaden límites ni generan URLs inseguras | NO | PENDIENTE | NO_EVALUADO | — |
| B05 | Salud/schema/docs/errores no filtran secretos, configuración o datos privados | NO | PENDIENTE | NO_EVALUADO | — |
| B06 | Task 8: versiones/instalaciones bloqueadas y CI; dependencias/locks/imágenes con advisories y alcance registrados | NO | PENDIENTE | NO_EVALUADO | — |
| B07 | Código/historia/build/logs/artefactos sin secretos, cuentas reales ni archivos privados publicados | NO | PENDIENTE | NO_EVALUADO | — |

## E2: cuentas y autenticación

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| A01 | Registro crea solo TOURIST; rechaza role, is_staff, is_superuser, ownership y campos extra | NO | PENDIENTE | NO_EVALUADO | — |
| A02 | Email normalizado, validación/password hashing y respuestas sin contraseña/hash | NO | PENDIENTE | NO_EVALUADO | — |
| A03 | Login inválido/inactivo, enumeración de cuentas y mensajes de error | NO | PENDIENTE | NO_EVALUADO | — |
| A04 | Verificación: token válido, caducado, usado, alterado, usuario ajeno e inactivo | NO | PENDIENTE | NO_EVALUADO | — |
| A05 | Reset: propósito, caducidad, un solo uso, atomicidad y revocación de sesiones tras contraseña | NO | PENDIENTE | NO_EVALUADO | — |
| A06 | Recuperación/reenvío no revelan existencia de emails; SMTP fallido sin resultado engañoso | NO | PENDIENTE | NO_EVALUADO | — |
| A07 | Cuotas Redis por operación/IP/email y resistencia a headers falsos; fallo Redis cerrado | NO | PENDIENTE | NO_EVALUADO | — |
| A08 | Usuario no verificado no consume/canjea; desactivación afecta sesiones y acciones protegidas | NO | PENDIENTE | NO_EVALUADO | — |
| A09 | CSRF/origin en login, refresh, logout y acciones de sesión Django Admin | NO | PENDIENTE | NO_EVALUADO | — |
| A10 | Inputs nulos/Unicode/JSON corrupto/tipos erróneos/longitudes extremas sin 500 ni bypass | NO | PENDIENTE | NO_EVALUADO | — |

## E2/F2: tokens y sesiones

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| T01 | JWT alterado/sin firma/algoritmo no permitido/clave errónea/caducado/tipo equivocado | NO | PENDIENTE | NO_EVALUADO | — |
| T02 | sid/pwd/user_id ausentes, ajenos o revocados no autentican | NO | PENDIENTE | NO_EVALUADO | — |
| T03 | Refresh rotado: replay y doble refresh concurrente no abren sesiones ilegítimas | NO | PENDIENTE | NO_EVALUADO | — |
| T04 | Logout revoca servidor y borra cookie; fallback bearer y logout fallido no resucitan sesión | NO | PENDIENTE | NO_EVALUADO | — |
| T05 | Cambio de contraseña/usuario y revocación afectan tokens previamente emitidos | NO | PENDIENTE | NO_EVALUADO | — |
| T06 | Cookie refresh HttpOnly/SameSite/path y Secure en prod; CORS no abre credenciales a terceros | NO | PENDIENTE | NO_EVALUADO | — |
| T07 | Access solo memoria; tokens/PIN/QR fuera de storage, query, logs, referrer y bundles | NO | PENDIENTE | NO_EVALUADO | — |
| T08 | Multi-tab/login/refresh/logout y respuestas tardías no cruzan identidades ni cookies | NO | PENDIENTE | NO_EVALUADO | — |

## E2/E3/07/08: QR, carpetas y recomendaciones privadas

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| R01 | QR firmado: alteración, versión vieja, perfil ajeno/deshabilitado y finalidades no intercambiables | NO | PENDIENTE | NO_EVALUADO | — |
| R02 | Redimir QR requiere sesión apropiada; no devuelve carpeta privada a anónimo | NO | PENDIENTE | NO_EVALUADO | — |
| R03 | Cliente A no accede a carpeta B sin QR autorizado: listas, detalles, red y medios | NO | PENDIENTE | NO_EVALUADO | — |
| R04 | Rotación/deshabilitación/retirada de selección revoca todas las rutas y URLs antiguas | NO | PENDIENTE | NO_EVALUADO | — |
| R05 | FolderBenefit canónico; FolderAccess/FolderProvider históricos no autorizan | NO | PENDIENTE | NO_EVALUADO | — |
| R06 | Colaborador agrega/quita solo beneficios concretos propios; no hereda nuevas ofertas del negocio | NO | PENDIENTE | NO_EVALUADO | — |
| R07 | Colaborador no habilita perfiles, asigna negocios ni cambia ofertas/reglas/QR ajenos | NO | PENDIENTE | NO_EVALUADO | — |
| R08 | Selección/revocación concurrente con consumo y borrado masivo respeta locks y revalidación | NO | PENDIENTE | NO_EVALUADO | — |

## E3/07/08: prestadores, catálogo y medios

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| P01 | Prestador solo lee/edita negocio/ofertas propios; manipular UUID/body/query no cruza ownership | NO | PENDIENTE | NO_EVALUADO | — |
| P02 | Un negocio por usuario Prestador; solo Admin asigna, publica y habilita | NO | PENDIENTE | NO_EVALUADO | — |
| P03 | Escrituras rechazan campos sensibles/extra y edición publicada vuelve a revisión | NO | PENDIENTE | NO_EVALUADO | — |
| P04 | Catálogo público expone solo publicados/vigentes y DTO explícito sin relaciones/credenciales | NO | PENDIENTE | NO_EVALUADO | — |
| P05 | Interruptor público afecta solo catálogo; selector privado y consumo conservan sus políticas | NO | PENDIENTE | NO_EVALUADO | — |
| P06 | Medios revalidan autorización/publicación/vigencia; no hay acceso directo a storage privado | NO | PENDIENTE | NO_EVALUADO | — |
| P07 | Upload: formato real/tamaño/dimensiones/nombre/ruta; sin traversal, ejecución ni fuga | NO | PENDIENTE | NO_EVALUADO | — |
| P08 | Red/paginación/filtros y errores no revelan carpetas, objetos ajenos o contadores privados | NO | PENDIENTE | NO_EVALUADO | — |

## E4: consumos, créditos y progreso

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| C01 | Consumo exige Cliente activo verificado, QR/PIN válidos y prestador/beneficio publicado vigente | NO | PENDIENTE | NO_EVALUADO | — |
| C02 | Directo permite colaborador nulo; referencia inválida no degrada a directo | NO | PENDIENTE | NO_EVALUADO | — |
| C03 | Referido revalida acceso bajo lock y exige la selección concreta del beneficio | NO | PENDIENTE | NO_EVALUADO | — |
| C04 | Unicidad vitalicia Cliente/Prestador y no doble crédito con requests concurrentes | NO | PENDIENTE | NO_EVALUADO | — |
| C05 | Idempotencia por actor/carga, replay estable y 409 al cambiar carga o modo | NO | PENDIENTE | NO_EVALUADO | — |
| C06 | Importe/regla/progreso del servidor; snapshots históricos y movimientos protegidos en PG | NO | PENDIENTE | NO_EVALUADO | — |
| C07 | Anulación/reintegro una vez; saldo insuficiente genera ajuste/bloqueo de canjes | NO | PENDIENTE | NO_EVALUADO | — |
| C08 | Wallet/historial/progreso/credenciales solo al actor apropiado; PIN hash/write-only | NO | PENDIENTE | NO_EVALUADO | — |

## E5: tienda, stock y pagos

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| S01 | Pedidos/listas/detalles/cancelaciones son propios; no lectura/acción cruzada por UUID | NO | PENDIENTE | NO_EVALUADO | — |
| S02 | Precios/moneda/cantidades/totales y créditos del servidor; sin pago mixto ni negativos/overflow | NO | PENDIENTE | NO_EVALUADO | — |
| S03 | Canje/último stock atómicos y locks User→Wallet→Order→Product por PK | NO | PENDIENTE | NO_EVALUADO | — |
| S04 | Checkout/cancelación/reintegro/retiro idempotentes; carga/actor ajenos sin replay filtrado | NO | PENDIENTE | NO_EVALUADO | — |
| S05 | Stock solo delta autorizado, con motivo/auditoría; snapshots/historia/claves protegidos en PG | NO | PENDIENTE | NO_EVALUADO | — |
| S06 | Estados/transiciones y solicitud de cancelación bloquean entrega indebida y doble reintegro | NO | PENDIENTE | NO_EVALUADO | — |
| S07 | payment_confirmed monotónica y expirable_orders común; reserva impaga vence con/sin ID remoto | NO | PENDIENTE | NO_EVALUADO | — |
| S08 | Pago confirmado/refund pendiente retiene stock; pago tardío se recupera sin liberación duplicada | NO | PENDIENTE | NO_EVALUADO | — |
| S09 | Webhook HMAC, manifest/query/casing/tiempo/tamaño/replay; sin acreditar por body | NO | PENDIENTE | NO_EVALUADO | — |
| S10 | GET autoritativo coteja seller/referencia/moneda/importe; rechaza respuestas de otro pedido | NO | PENDIENTE | NO_EVALUADO | — |
| S11 | Outbox/inbox temprano/búsqueda recuperan timeout/CREATE incierto con claves estables | NO | PENDIENTE | NO_EVALUADO | — |
| S12 | Leases/fencing global descartan respuesta vieja; HTTP fuera de atomic | NO | PENDIENTE | NO_EVALUADO | — |
| S13 | Refund POST no repone; GET total concordante sí; PICKED_UP conserva inventario y audita | NO | PENDIENTE | NO_EVALUADO | — |
| S14 | Provider disabled por defecto; fake prohibido en prod; secretos/payloads remotos no filtrados | NO | PENDIENTE | NO_EVALUADO | — |
| S15 | Sandbox Mercado Pago real: interoperabilidad, firma, GET, checkout/refund de cuentas de prueba | NO | BLOQUEADO | NO_EVALUADO | Pendiente campaña externa y credenciales de prueba; no ejecutar desde este plan local |

## Admin Django y panel administrativo implementado

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| M01 | Cada API administrativa exige ADMIN activo y flags requeridos; probar combinaciones parciales | NO | PENDIENTE | NO_EVALUADO | — |
| M02 | Django Admin requiere permisos efectivos; staff/Prestador con permisos parciales no evade dominio | NO | PENDIENTE | NO_EVALUADO | — |
| M03 | Settings públicos tienen DTO mínimo; privados/cache/errores no filtran secretos o valores sensibles | NO | PENDIENTE | NO_EVALUADO | — |
| M04 | Versión/HMAC: Unicode/malformada/ausente/obsoleta sin 500 ni pérdida de actualización | NO | PENDIENTE | NO_EVALUADO | — |
| M05 | Comandos sensibles idempotentes, actor/acción/carga aislados y efecto/auditoría atómicos | NO | PENDIENTE | NO_EVALUADO | — |
| M06 | QR/PIN/roles/reglas/reasignación solo mediante acciones autorizadas y sin historia sensible en replay | NO | PENDIENTE | NO_EVALUADO | — |
| M07 | Sin PATCH/DELETE genérico de historia financiera, estado monetario o stock absoluto | NO | PENDIENTE | NO_EVALUADO | — |
| M08 | GET de defaults no escribe; auditoría mínima sin secretos; filtros y actividad autorizados | NO | PENDIENTE | NO_EVALUADO | — |

## F2/paneles: navegador e inputs

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| F01 | XSS almacenado/reflejado/DOM en textos, datos editables, errores y enlaces/esquemas URL | NO | PENDIENTE | NO_EVALUADO | — |
| F02 | Navegación directa, deep links y rutas por rol respaldadas por permisos del servidor | NO | PENDIENTE | NO_EVALUADO | — |
| F03 | Logout/cambio de usuario desmonta datos, aborta respuestas viejas y revoca blobs privados | NO | PENDIENTE | NO_EVALUADO | — |
| F04 | QR se limpia de fragmento antes de recursos; credenciales fuera de referrer/log/terceros | NO | PENDIENTE | NO_EVALUADO | — |
| F05 | SQL/ORM/filtros/JSON/multipart/headers/métodos no soportados sin inyección ni efectos | NO | PENDIENTE | NO_EVALUADO | — |
| F06 | Redirecciones y enlaces externos configurables sin open redirect ni esquemas ejecutables | NO | PENDIENTE | NO_EVALUADO | — |

## Operación, evidencia y límites

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| O01 | No-store/no-referrer/nosniff y políticas de seguridad según endpoint, incluidos errores | NO | PENDIENTE | NO_EVALUADO | — |
| O02 | TLS/cookies/HSTS/CSP/proxy de un despliegue real autorizado, si existe objetivo | NO | PENDIENTE | NO_EVALUADO | Si no existe objetivo se registra bloqueo; settings locales no prueban TLS real |
| O03 | Tasks/commands financieros recuperables y restringidos al operador/infraestructura prevista | NO | PENDIENTE | NO_EVALUADO | — |
| O04 | Evidencia saneada y trazable a corte, caso, hallazgo, fix, test y revisión independiente | NO | PENDIENTE | NO_EVALUADO | — |
| O05 | Dependencias/DAST/secret scanning tienen alcance real y alertas triadas; fallos de feed explícitos | NO | PENDIENTE | NO_EVALUADO | — |
| O06 | Cada fix tiene RED/GREEN, prueba del ataque original, revisión independiente y checks de integración | NO | PENDIENTE | NO_EVALUADO | — |
| O07 | Corte final y cobertura sin falsos PASS por tarea no implementada, bloqueo o test histórico | NO | PENDIENTE | NO_EVALUADO | — |

## Resumen inicial

Todavía no se ejecutaron controles de esta campaña. Todos conservan `Chequeado=NO` y `Hallazgo=NO_EVALUADO`. El bloqueo sandbox es una limitación conocida, no una vulnerabilidad encontrada. El total y sus denominadores se calculan desde las filas del inventario/casos al ejecutar; no sumar tareas no implementadas ni bloqueos como aprobadas.

Las suites y QA históricos siguen en `docs/verification/`; son insumos, no evidencia nueva de esta campaña.
