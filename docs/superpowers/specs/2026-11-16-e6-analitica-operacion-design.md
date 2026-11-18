# E6 — Analítica y preparación operativa

Diseño propuesto para aprobación. Base revisada: `develop` en `7bb1a75`, después de perfiles, comisiones y la corrección de continuidad del QR. Alcance: [E6 en el roadmap](../../plans/00-roadmap.md#task-6-e6---analítica-y-preparación-operativa).

## Propósito

La Administración necesita saber qué recomendaciones generan visitas y cómo se mueve la red, los créditos y la tienda. Cada rol debe ver solo lo que puede usar para decidir: el Prestador, su negocio; el Colaborador, sus referencias; el Cliente, su propio recorrido. La preparación operativa debe demostrar que el sistema se puede recuperar y reconciliar sin modificar historia, confirmar pagos a mano ni depender de un despliegue real.

Hoy la ficha administrativa de un colaborador ya muestra clientes únicos vinculados y visitas válidas atribuidas, sin filtro temporal. Las cuentas, el historial del Colaborador, el progreso del Cliente y la operación de tienda ya tienen superficies y datos propios. E6 no las reemplaza ni introduce una segunda fuente de verdad.

## Enfoques considerados

- **E6 completa por etapas verificables (elegido):** entregar primero el informe de visitas y después extender las métricas y probar la recuperación. Cada etapa tiene un cierre verificable; el trabajo local no espera permisos ni credenciales externas.
- **Solo informe de visitas:** entrega valor antes y documenta el resto como pendientes, pero no resuelve el alcance de E6 solicitado.
- **Toda la infraestructura antes del primer informe:** permite uniformar más temprano, pero pospone el aprendizaje sobre los datos históricos y obliga a diseñar una arquitectura analítica antes de demostrar su necesidad.

## Etapas y criterios de cierre

### E6.1 — Visitas atribuidas para Administración

- Incorporar un informe de solo lectura en `/gestion`, dentro de «Créditos y visitas». La ficha del Colaborador conserva su resumen histórico. El informe acepta un período de fechas y un Colaborador opcional; el período inicial propuesto es de 30 días naturales. El servidor valida los filtros y usa fechas de Ushuaia, desde el comienzo del primer día inclusive hasta el comienzo del día siguiente al último exclusive.
- **Clientes vinculados por QR:** personas distintas con un `FolderAccess` creado dentro del período. Deduplicar renovaciones del QR por persona en el alcance consultado. Una relectura que no crea un vínculo no es un evento. En la vista de toda la red, una misma persona puede aparecer en varios colaboradores, pero cuenta una sola vez en el total. No desglosar vínculos por comercio: el vínculo no pertenece a un comercio. Excluir DEMO cuando su procedencia se pueda comprobar. `FolderAccess` no tiene una marca DEMO; si la base contiene vínculos de semillas históricas que no se pueden distinguir, mostrar este indicador como «No disponible para este período», sin bloquear las visitas atribuibles que sí se puedan medir. No reclasificar cuentas por su correo, ni inventar una limpieza histórica.
- **Visitas atribuidas válidas:** `Consumption` con Colaborador, estado `VALID` al consultar y fecha de consumo en el período. Excluir directas del informe, anuladas y datos DEMO. Desglosar por comercio usando el Prestador registrado en el consumo. No inferir accesos de la selección actual ni ocultar historia de colaboradores o comercios hoy deshabilitados. Informar que vínculos y visitas son métricas distintas, no una tasa de conversión.
- Consultas agregadas en PostgreSQL, con respuestas acotadas, orden estable y la guarda `IsProgramAdmin` del servidor. Ningún DTO analítico expone PII de Clientes, códigos QR, PIN, CBU, secretos ni filas privadas para calcular los totales en React. Demostrar los recuentos con fixtures de renovaciones, varios colaboradores, consumos anulados, límites de fecha y DEMO. Medir una carga representativa en PostgreSQL y justificar cualquier índice con evidencia.
- **Cierre:** el informe coincide con las consultas de control; las combinaciones no autorizadas no reciben datos; el panel preserva filtros, distingue vacío de error y funciona con teclado y en pantallas estrechas.

### E6.2 — Métricas por rol, créditos y tienda

| Rol | Lectura prevista | Límite |
|---|---|---|
| Administrador | Consumos directos y atribuidos, movimientos de crédito por tipo y señales de tienda | Agregados globales de la operación, con unidades y fechas explícitas |
| Prestador | Visitas válidas, directas y referidas, de su negocio; desglose de beneficios cuando haya dato histórico | Solo el negocio actualmente asignado; sin identidad adicional del Cliente |
| Colaborador | Clientes vinculados y visitas válidas de su propia red, con desglose por comercio; enlace a su historial de comisiones | Solo su perfil habilitado; no confundir comisiones pendientes con visitas ni con ventas |
| Cliente | Saldo, progreso e historial propios en «Mi viaje» | Reusar la vista y el contrato propios; sin reportes de otras cuentas ni una sección analítica nueva |

- Separar fuentes y unidades: **visitas** desde `Consumption`; **créditos** desde `WalletEntry` (`EARN`, `REVERSAL`, `REDEEM`, `REFUND`, `ADJUSTMENT`), sin reconstruir saldo ni presentar crédito como ARS; **tienda** desde pedidos y su historia verificable. Diferenciar canjes, pagos monetarios confirmados y reintegros. Reservas, pagos desconocidos y el proveedor `fake` no son ventas reales. Montos declarados para comisiones no son ventas de tienda ni cobros verificados.
- La analítica del Colaborador no amplía el acceso al catálogo privado. El total incluye el historial propio, pero el desglose solo nombra comercios que siguen visibles en su selección autorizada; las visitas restantes se agrupan como «Otros comercios». Un perfil deshabilitado pierde acceso a E6, sin cambiar las reglas existentes del historial de comisiones. El Administrador conserva la vista histórica con nombres.
- Cada métrica declara fecha de referencia, período, estados que incluye y tratamiento de DEMO. El informe de tienda incluye canjes fechados y pagos monetarios o reintegros con fecha verificable. Las confirmaciones sin fecha comprobable se muestran aparte como dato sin fecha, sin incorporarlas a importes del período; no usar la creación del pedido como sustituto. No se necesitan eventos nuevos ni reconstrucción histórica para este corte. Para registros que anteceden al beneficio guardado, mostrar «Sin beneficio registrado» cuando corresponda. No identificar DEMO por texto visible ni por correos: usar marcas, vínculos o procedencia de dominio comprobable. Si alguna fuente histórica carece de procedencia fiable, no presentar un total mixto como real; documentar el indicador no disponible.
- **Cierre:** consultas comparadas con fixtures de los cuatro roles, revocación y cambio de asignación, movimientos compensatorios, estados de pago/reintegro y cuentas/demo. Cada tablero distingue dinero, créditos y personas y no confunde falta de evidencia con cero.

### E6.3 — Seguridad y controles de publicación

- Los permisos y pruebas de aislamiento se entregan desde E6.1. Esta etapa consolida el inventario de endpoints, la política de minimización, el reuso de los controles de sesión y autorización de servidor, y una matriz de regresión contra la [auditoría existente](../../security/checklist.md). Probar acceso cruzado, roles incompletos, sesión revocada, filtros inválidos, cotas de consulta y ausencia de PII, credenciales o enlaces privados en respuestas, cachés y registros.
- Comprobar en un entorno aislado la configuración de despliegue que ya existe: TLS y cabeceras del proxy, política de sesión, archivos privados y separación de servicios. Las pruebas de servidor/HTTPS público, SMTP real y escáner en iOS/Android físicos quedan como controles previos al piloto, con evidencia propia; no se declaran aprobadas por una prueba local.
- **Cierre:** controles con resultado documentado y ningún bloqueo local sin explicar. Los controles externos se registran como pendientes con requisito, responsable operativo por asignar y evidencia necesaria; no se habilitan por esta etapa.

### E6.4 — Recuperación, reconciliación y traspaso operativo

- Definir y ensayar una copia y restauración de PostgreSQL y de medios públicos/privados consistentes, en un entorno Docker desechable con datos sintéticos. Registrar integridad, tiempos observados, versión y verificación de lectura, acceso privado, saldo, pedidos y comisiones después de restaurar. Documentar la política de protección, retención y recuperación de claves/configuración sin copiar secretos a Git. Inventariar Redis con sus funciones reales (sesiones, throttling y colas según aplique) y dejar explícito qué se restaura, expira o reconstruye y cómo reanudar sin reactivar una sesión revocada. RPO/RTO y destino real requieren aprobación del operador antes de una instalación productiva.
- Reusar `process_shop_outbox`, `expire_shop_orders` y `reconcile_shop_orders` descritos en el [runbook](../../shop-operations.md). Diseñar una programación explícita y verificable en laboratorio: lotes, heartbeat, retraso, operaciones bloqueadas, reinicios y resultado sanitizado. Los comandos de tienda conservan sus locks, fencing, claves e idempotencia; solo funcionan con el adaptador local en esta prueba. Proponer comprobaciones de consistencia de saldo/libro y comisiones en modo diagnóstico, sin corregir datos ni volver a ejecutar transferencias automáticamente.
- **Cierre:** simulacro repetible sobre PostgreSQL aislado, recuperación tras interrupción y reintentos sin duplicados, lista de alertas y acciones para el operador, y checklist separado para TLS, SMTP, scheduler y sandbox de Mercado Pago. El sitio actual no se despliega ni se modifica.

## Dirección de interfaz — operar, no exhibir

Extender el sistema de `/gestion` y los espacios de rol: navegación, tipografía, controles, tablas y lenguaje existentes. La tarea principal es elegir un período y entender qué pasó. Priorizar el período visible y los totales con su definición, luego el desglose. No introducir un rediseño ni gráficas decorativas; la tabla accesible es la representación principal y un gráfico solo se justifica si mejora una comparación concreta. Usar encabezados semánticos, foco visible, estado de carga estable, mensaje de período vacío, reintento ante fallo y lectura útil a 320 px sin desbordar la página. Validar escritorio, móvil y zoom con datos sintéticos representativos y cero valores inventados.

## Límites y traspaso al plan

- Sin checkout, canje web, desembolsos, sincronización de terceros, nuevas reglas de créditos, cambios de atribución, ni habilitación de Mercado Pago. Sin data warehouse, instrumentación de clics o reconstrucción de hechos históricos no registrados.
- El plan debe fijar los archivos, interfaces, comandos y pruebas por etapa, con PostgreSQL/Redis en Docker, lint, tipos, build, validación de OpenAPI y verificación visual en las superficies afectadas. Mantener `ToDo.md`, `CONTEXT.md`, el roadmap, la guía administrativa y el contrato alineados, sin marcar como validados controles externos no ejecutados.
- Integración por etapas desde `develop` según GitFlow. Ninguna aprobación de diseño autoriza implementación, publicación, despliegue, acceso remoto o transferencia de archivos.
