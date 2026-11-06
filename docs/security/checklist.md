# Checklist de seguridad

Fecha inicial 24/10/2026. Estado **INCOMPLETA** desde el 05/11/2026 sobre el corte `7467838`. Los 85 controles agrupados se amplían por endpoint y caso. Ver [inventario](inventario.md) y [corrida](runs/20261105-1823-7467838/resumen.md).

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
| B01 | Inventario completo de rutas, métodos, comandos, Admin, medios y superficies fuera de OpenAPI | PARCIAL | EN_CURSO | NO_EVALUADO | [Inventario](inventario.md) |
| B02 | Entorno auditado aislado: PG/Redis/SMTP/storage, claves, cuentas y puertos propios | SI | PASS | NINGUNO | [Laboratorio](laboratorio.md) |
| B03 | Producción rechaza claves vacías/compartidas, DEBUG y configuración insegura según requisitos | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| B04 | Host/proxy: headers de cliente falsificados no evaden límites ni generan URLs inseguras | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| B05 | Salud/schema/docs/errores no filtran secretos, configuración o datos privados | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| B06 | Task 8: versiones/instalaciones bloqueadas y CI; dependencias/locks/imágenes con advisories y alcance registrados | PARCIAL | EN_CURSO | SEC-011, SEC-012 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| B07 | Código/historia/build/logs/artefactos sin secretos, cuentas reales ni archivos privados publicados | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |

## E2: cuentas y autenticación

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| A01 | Registro crea solo TOURIST; rechaza role, is_staff, is_superuser, ownership y campos extra | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| A02 | Email normalizado, validación/password hashing y respuestas sin contraseña/hash | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| A03 | Login inválido/inactivo, enumeración de cuentas y mensajes de error | PARCIAL | EN_CURSO | SEC-013 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| A04 | Verificación: token válido, caducado, usado, alterado, usuario ajeno e inactivo | PARCIAL | EN_CURSO | SEC-009 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| A05 | Reset: propósito, caducidad, un solo uso, atomicidad y revocación de sesiones tras contraseña | PARCIAL | EN_CURSO | SEC-006, SEC-009, SEC-014 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| A06 | Recuperación/reenvío no revelan existencia de emails; SMTP fallido sin resultado engañoso | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| A07 | Cuotas Redis por operación/IP/email y resistencia a headers falsos; fallo Redis cerrado | PARCIAL | EN_CURSO | SEC-004 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| A08 | Usuario no verificado no consume/canjea; desactivación afecta sesiones y acciones protegidas | PARCIAL | EN_CURSO | SEC-010, SEC-013 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| A09 | CSRF/origin en login, refresh, logout y acciones de sesión Django Admin | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| A10 | Inputs nulos/Unicode/JSON corrupto/tipos erróneos/longitudes extremas sin 500 ni bypass | PARCIAL | EN_CURSO | SEC-002, SEC-005, SEC-006 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |

## E2/F2: tokens y sesiones

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| T01 | JWT alterado/sin firma/algoritmo no permitido/clave errónea/caducado/tipo equivocado | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| T02 | sid/pwd/user_id ausentes, ajenos o revocados no autentican | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| T03 | Refresh rotado: replay y doble refresh concurrente no abren sesiones ilegítimas | PARCIAL | EN_CURSO | SEC-008 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| T04 | Logout revoca servidor y borra cookie; fallback bearer y logout fallido no resucitan sesión | PARCIAL | EN_CURSO | SEC-003, SEC-008 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| T05 | Cambio de contraseña/usuario y revocación afectan tokens previamente emitidos | PARCIAL | EN_CURSO | SEC-009, SEC-010, SEC-013, SEC-014 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| T06 | Cookie refresh HttpOnly/SameSite/path y Secure en prod; CORS no abre credenciales a terceros | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| T07 | Access solo memoria; tokens/PIN/QR fuera de storage, query, logs, referrer y bundles | NO | PENDIENTE | NO_EVALUADO | — |
| T08 | Multi-tab/login/refresh/logout y respuestas tardías no cruzan identidades ni cookies | PARCIAL | EN_CURSO | SEC-001, SEC-003 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |

## E2/E3/07/08: QR, carpetas y recomendaciones privadas

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| R01 | QR firmado: alteración, versión vieja, perfil ajeno/deshabilitado y finalidades no intercambiables | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| R02 | Redimir QR requiere sesión apropiada; no devuelve carpeta privada a anónimo | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| R03 | Cliente A no accede a carpeta B sin QR autorizado: listas, detalles, red y medios | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| R04 | Rotación/deshabilitación/retirada de selección revoca todas las rutas y URLs antiguas | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| R05 | FolderBenefit canónico; FolderAccess/FolderProvider históricos no autorizan | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| R06 | Colaborador agrega/quita solo beneficios concretos propios; no hereda nuevas ofertas del negocio | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| R07 | Colaborador no habilita perfiles, asigna negocios ni cambia ofertas/reglas/QR ajenos | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| R08 | Selección/revocación concurrente con consumo y borrado masivo respeta locks y revalidación | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |

## E3/07/08: prestadores, catálogo y medios

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| P01 | Prestador solo lee/edita negocio/ofertas propios; manipular UUID/body/query no cruza ownership | PARCIAL | EN_CURSO | SEC-007 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| P02 | Un negocio por usuario Prestador; solo Admin asigna, publica y habilita | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| P03 | Escrituras rechazan campos sensibles/extra y edición publicada vuelve a revisión | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| P04 | Catálogo público expone solo publicados/vigentes y DTO explícito sin relaciones/credenciales | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| P05 | Interruptor público afecta solo catálogo; selector privado y consumo conservan sus políticas | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| P06 | Medios revalidan autorización/publicación/vigencia; no hay acceso directo a storage privado | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| P07 | Upload: formato real/tamaño/dimensiones/nombre/ruta; sin traversal, ejecución ni fuga | PARCIAL | EN_CURSO | SEC-011 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| P08 | Red/paginación/filtros y errores no revelan carpetas, objetos ajenos o contadores privados | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |

## E4: consumos, créditos y progreso

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| C01 | Consumo exige Cliente activo verificado, QR/PIN válidos y prestador/beneficio publicado vigente | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C02 | Directo permite colaborador nulo; referencia inválida no degrada a directo | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C03 | Referido revalida acceso bajo lock y exige la selección concreta del beneficio | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C04 | Unicidad vitalicia Cliente/Prestador y no doble crédito con requests concurrentes | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C05 | Idempotencia por actor/carga, replay estable y 409 al cambiar carga o modo | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C06 | Importe/regla/progreso del servidor; snapshots históricos y movimientos protegidos en PG | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C07 | Anulación/reintegro una vez; saldo insuficiente genera ajuste/bloqueo de canjes | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| C08 | Wallet/historial/progreso/credenciales solo al actor apropiado; PIN hash/write-only | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |

## E5: tienda, stock y pagos

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| S01 | Pedidos/listas/detalles/cancelaciones son propios; no lectura/acción cruzada por UUID | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S02 | Precios/moneda/cantidades/totales y créditos del servidor; sin pago mixto ni negativos/overflow | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S03 | Canje/último stock atómicos y locks User→Wallet→Order→Product por PK | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S04 | Checkout/cancelación/reintegro/retiro idempotentes; carga/actor ajenos sin replay filtrado | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S05 | Stock solo delta autorizado, con motivo/auditoría; snapshots/historia/claves protegidos en PG | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S06 | Estados/transiciones y solicitud de cancelación bloquean entrega indebida y doble reintegro | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S07 | payment_confirmed monotónica y expirable_orders común; reserva impaga vence con/sin ID remoto | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S08 | Pago confirmado/refund pendiente retiene stock; pago tardío se recupera sin liberación duplicada | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S09 | Webhook HMAC, manifest/query/casing/tiempo/tamaño/replay; sin acreditar por body | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S10 | GET autoritativo coteja seller/referencia/moneda/importe; rechaza respuestas de otro pedido | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S11 | Outbox/inbox temprano/búsqueda recuperan timeout/CREATE incierto con claves estables | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S12 | Leases/fencing global descartan respuesta vieja; HTTP fuera de atomic | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S13 | Refund POST no repone; GET total concordante sí; PICKED_UP conserva inventario y audita | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S14 | Provider disabled por defecto; fake prohibido en prod; secretos/payloads remotos no filtrados | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| S15 | Sandbox Mercado Pago real: interoperabilidad, firma, GET, checkout/refund de cuentas de prueba | NO | BLOQUEADO | NO_EVALUADO | Pendiente campaña externa y credenciales de prueba; no ejecutar desde este plan local |

## Admin Django y panel administrativo implementado

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| M01 | Cada API administrativa exige ADMIN activo y flags requeridos; probar combinaciones parciales | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| M02 | Django Admin requiere permisos efectivos; staff/Prestador con permisos parciales no evade dominio | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| M03 | Settings públicos tienen DTO mínimo; privados/cache/errores no filtran secretos o valores sensibles | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| M04 | Versión/HMAC: Unicode/malformada/ausente/obsoleta sin 500 ni pérdida de actualización | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| M05 | Comandos sensibles idempotentes, actor/acción/carga aislados y efecto/auditoría atómicos | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| M06 | QR/PIN/roles/reglas/reasignación solo mediante acciones autorizadas y sin historia sensible en replay | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| M07 | Sin PATCH/DELETE genérico de historia financiera, estado monetario o stock absoluto | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| M08 | GET de defaults no escribe; auditoría mínima sin secretos; filtros y actividad autorizados | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |

## F2/paneles: navegador e inputs

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| F01 | XSS almacenado/reflejado/DOM en textos, datos editables, errores y enlaces/esquemas URL | NO | PENDIENTE | NO_EVALUADO | — |
| F02 | Navegación directa, deep links y rutas por rol respaldadas por permisos del servidor | NO | PENDIENTE | NO_EVALUADO | — |
| F03 | Logout/cambio de usuario desmonta datos, aborta respuestas viejas y revoca blobs privados | PARCIAL | EN_CURSO | SEC-001 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| F04 | QR se limpia de fragmento antes de recursos; credenciales fuera de referrer/log/terceros | NO | PENDIENTE | NO_EVALUADO | — |
| F05 | SQL/ORM/filtros/JSON/multipart/headers/métodos no soportados sin inyección ni efectos | PARCIAL | EN_CURSO | SEC-002, SEC-005 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| F06 | Redirecciones y enlaces externos configurables sin open redirect ni esquemas ejecutables | NO | PENDIENTE | NO_EVALUADO | — |

## Operación, evidencia y límites

| ID | Qué comprobar | Chequeado | Resultado | Hallazgo | Solución / evidencia |
|---|---|---|---|---|---|
| O01 | No-store/no-referrer/nosniff y políticas de seguridad según endpoint, incluidos errores | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| O02 | TLS/cookies/HSTS/CSP/proxy de un despliegue real autorizado, si existe objetivo | NO | BLOQUEADO | NO_EVALUADO | Falta un despliegue HTTPS autorizado. Retomar con el responsable de infraestructura. |
| O03 | Tasks/commands financieros recuperables y restringidos al operador/infraestructura prevista | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| O04 | Evidencia saneada y trazable a corte, caso, hallazgo, fix, test y revisión independiente | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |
| O05 | Dependencias/DAST/secret scanning tienen alcance real y alertas triadas; fallos de feed explícitos | PARCIAL | EN_CURSO | SEC-011, SEC-012 | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| O06 | Cada fix tiene RED/GREEN, prueba del ataque original, revisión independiente y checks de integración | PARCIAL | EN_CURSO | NO_EVALUADO | [Casos de la corrida](runs/20261105-1823-7467838/casos.md) |
| O07 | Corte final y cobertura sin falsos PASS por tarea no implementada, bloqueo o test histórico | PARCIAL | EN_CURSO | NO_EVALUADO | [Regresión integrada](runs/20261105-1823-7467838/casos.md#regresión-integrada) |

## Estado de la corrida

Los casos parciales mantienen su evidencia y los hallazgos asociados. La comprobación de TLS real está bloqueada hasta contar con un despliegue autorizado. Las suites y QA históricos siguen en `docs/verification/` y sirven de insumo para repetir casos.
