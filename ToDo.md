# Pendientes

- [x] Preparar auditoría CI con excepción visible, acotada y con vencimiento para picomatch 4.0.7 sin parche oficial. No equivale a corregir la vulnerabilidad. [Verificación](docs/verification/19-auditoria-picomatch.md).
- [ ] Sustituir la excepción de GHSA-fc5q-39xc-vjpf por una actualización corregida y verificada antes del 25/11/2026 a las 00:00 UTC; no prorrogar automáticamente.

- [x] Permitir quitar un destacado desde su fila y retirar un beneficio de la carpeta desde la misma tarjeta del catálogo privado. [Verificación](docs/verification/18-selecciones-reversibles.md).

- [x] Pulir visualmente el informe de visitas: filtros alineados, búsqueda separada, navegación junto a la lista y adaptación móvil. [Verificación](docs/verification/17-analitica-e6.md#ajuste-visual-del-informe--17112026).

- [x] Permitir tasas de comisión por beneficio y fijarlas en las nuevas validaciones referidas con QR y PIN.
- [x] Mostrar al Colaborador su historial de consumos referidos y el total de comisiones aprobadas pendientes de conciliación.

- [x] Implementar perfiles de Cliente y Colaborador, captura del beneficio referido con QR y PIN y seguimiento de comisión hasta el cierre. [Diseño](docs/superpowers/specs/2026-11-10-perfiles-y-comisiones-design.md) · [Plan](docs/superpowers/plans/2026-11-10-perfiles-y-comisiones.md)
- [x] Incorporar contacto público y WhatsApp configurable. [Guía y verificación de Mailpit](docs/contact-email.md).

- [x] Agregar la sección de Beneficios destacados con búsqueda, selección manual y límite de cinco protegido en PostgreSQL. [Plan](docs/superpowers/plans/2026-11-05-limite-destacados-inicio.md).

- [x] Revisar y ajustar visualmente el panel y el catálogo del [PR #20](https://github.com/SebaaM/llave-extra/pull/20) en escritorio y móvil, con respuestas sintéticas. [Evidencia](docs/verification/16-backoffice-tienda-catalogo.md).
- [x] Confirmar el CI del PR #20, integrado en develop en `7467838`.
- [x] Ajustar el menú de `/gestion` con accesos directos, grupos por tarea y scroll ajustado al espacio disponible. [Guía](docs/panel-administracion.md) y [verificación](docs/verification/16-backoffice-tienda-catalogo.md).
- [ ] Validar el sandbox externo de pagos. Compra y canje web continúan deshabilitados.

- [x] Comando opcional `seed_activity_demo` con volumen para web/backoffice: consumos directos/referidos, créditos, ajustes, canjes y pagos fake, sin carga automática ni cambios de datos previos. [Guía](docs/demo-activity.md); [evidencia](docs/verification/15-seed-actividad-demo.md).

- [x] Arranque local con consola adjunta: PowerShell y Bash muestran todos los servicios al finalizar la preparación; `Ctrl+C` detiene los contenedores conservando volúmenes. Ver `DEV.md`.

- [x] Corregir la pérdida de atribución tras 404 y fallo temporal de recuperación (503/red). Se conservan solo los IDs ya guardados; una recarga exige revalidar con el servidor. [Verificación](docs/verification/14-seleccion-qr-contextual.md#corrección-de-continuidad--16112026).
- [x] Publicar [PR #18](https://github.com/SebaaM/llave-extra/pull/18) de `feature/cliente-qr-destacados`; Git registra su integración en `develop` en `c43eeea`. La integración no acredita aprobación del cliente ni QA visual.
- [ ] Revisión visual manual del corte nuevo (desktop/móvil, zoom y safe area): herramienta de Opera agotó autorización; [evidencia y límites](docs/verification/14-seleccion-qr-contextual.md).

- [x] Agregar «Cómo funciona» al catálogo con explicación de créditos para canje en tienda, indicando que el canje aún no está habilitado; integrado en F2 del plan de destacados.

- [x] Hero con beneficios destacados por Administrador desde backoffice, filtrados por política pública y recorridos mediante carrusel paginado; [plan](docs/superpowers/plans/2026-11-01-destacados-hero.md). Sin fallback a beneficios no destacados.

- [x] Incorporar escáner para Cliente y acceso a Mi QR para Colaborador.
- [ ] Validar cámara en iOS/Android físicos con HTTPS y el origen de PUBLIC_APP_URL.

- [x] Aplicar selección contextual por QR: catálogo sin sección permanente Recomendaciones, selección vigente tras login con nombre, vínculo de ingreso/resumen Admin, atribución y QR del negocio + PIN; QR del colaborador estable y renovable manualmente en su espacio. [Plan vigente](docs/superpowers/plans/2026-10-30-seleccion-qr-contextual.md). Sustituye el corte inicial de catálogo único y la pantalla permanente históricos.

- [x] Diseño de ajustes del Cliente aprobado el 30/10 e implementación registrada: lenguaje cotidiano, recomendaciones recibidas condicionales, navegación/red adaptables, orden del inicio, carrusel y libreta abierta; [antes/después y pruebas](docs/verification/13-ajustes-vista-cliente.md). Revisión integral y corrector aprobados; la aprobación final del cliente sigue pendiente.
- [ ] Confirmar la aprobación final del cliente para el corte del PR #18 tras el QA visual; el PR ya consta integrado.

- [x] Diagnosticar el CI de develop `8250205`: fallo exclusivo de auditoría por minimatch transitivo; corrección temporal a 11.0.1 sin desactivar el control. [Evidencia](docs/verification/14-ci-develop.md).
- [x] Corregir espera de render en las pruebas de navegación Admin y verificar en Docker Linux: 309 UI + 1 proxy, lint, tipos, build y auditoría aprobados.
- [x] PR #17 de `feature/corregir-ci-develop` integrada externamente en `develop` el 2/11 (`054342e`); incorporada localmente a la rama Cliente, sin fusionar su entrega.

- [x] [PR #16](https://github.com/SebaaM/llave-extra/pull/16) fusionado externamente el 31/10/2026 en `8250205`; el diagnóstico de CI posterior no acredita el QA de navegador restante descrito en la evidencia.

- [x] Backend de mejoras visuales del Cliente T2/T2b: categorías públicas completas y nombre actual del comercio en historial propio. Producto `e3f04fa`, rama `feature/api-cliente-visual` desde develop `754982d`; 108 pruebas PG/Redis y QA HTTP real aprobados. Revisiones por tarea e integral aprobadas sin hallazgos pendientes. [Evidencia](docs/verification/12-api-cliente-visual.md).
- [x] Publicar `feature/api-cliente-visual` y abrir [PR #14](https://github.com/SebaaM/llave-extra/pull/14) hacia develop en `SebaaM/llave-extra`, sin fusionar. Publicación autorizada expresamente por el usuario; CI vigente en las comprobaciones del PR.
- [x] Frontend del [plan visual](docs/superpowers/plans/2026-10-27-frontend-cliente-visual.md): navegación, catálogo, red, recomendaciones, pasaporte, QR, acceso/perfil y tienda de ejemplo implementados y revisados por etapa. [Antes/después](docs/verification/11-frontend-cliente-visual.md).
- [x] Cierre de código de la entrega inicial PR #16: revisión integral local registrada y posterior integración externa el 31/10. La revisión visual manual restante se centraliza en el pendiente del corte nuevo indicado arriba; HTTP y regresión actuales están en docs/verification/14-seleccion-qr-contextual.md. La tienda transaccional sigue fuera de este alcance.

- [x] Catálogo visual de tienda adelantado: `/tienda` y fichas públicas con nueve ejemplos, ilustraciones propias, ARS/créditos ilustrativos, búsqueda/filtros/orden/paginación. Sin seed, checkout ni canjes. [Plan](docs/superpowers/plans/2026-10-26-catalogo-tienda-visual.md), [evidencia](docs/verification/10-catalogo-tienda-visual.md). El resto transaccional de F3 y E6 siguen pendientes.

- [x] Panel ADMIN React y configuración: implementados en `/gestion` (`affa345`), con 274 pruebas PostgreSQL/Redis, 115 UI y 1 proxy aprobadas. Revisión integral y focal aprobadas; [PR #12](https://github.com/SebaaM/llave-extra/pull/12) abierto, sin fusionar; CI vigente en sus comprobaciones; sin analíticas ni compra del Cliente. [Checklist](docs/verification/09-panel-admin-checklist.md), [evidencia](docs/verification/09-panel-admin.md), [guía](docs/panel-administracion.md). Rama `feature/panel-admin`, dependiente de #11/#10 sin fusionar.

- [ ] Completar las variantes parciales de la auditoría en `feature/auditoria-seguridad` desde `7467838`. Al 06/11 se integraron 18 correcciones individuales. La verificación de despliegue HTTPS y el sandbox real de Mercado Pago están bloqueados. [Corrida actual](docs/security/runs/20261105-1823-7467838/resumen.md), [checklist](docs/security/checklist.md) y [hallazgos](docs/security/hallazgos.md).

- [x] F3 operativo adelantado: dashboards Prestador y Colaborador, barra lateral, un negocio por usuario Prestador y selección concreta de beneficios. Admin en Django; sin tienda ni analíticas. [PR #10](https://github.com/SebaaM/llave-extra/pull/10) contra develop, sin fusionar y dependiente del #9. Producto revisado, QA real y CI `bc36bc0` aprobados; CI vigente en el PR. Ver [plan 08](docs/plans/08-backoffice-red.md) y [evidencia](docs/verification/08-backoffice-red.md). Detenerse al completar esta etapa.
- [x] Plan 08 Task 1: backend de selección concreta, APIs propias y unicidad de negocio revisados en `26458f2`; migración principal aplicada por el orquestador con preflight sin usuarios multinegocio.
- [x] Plan 08 Task 2: paneles React Prestador/Colaborador, multipart, rutas por rol y QR privado; QA real y revisión independiente aprobadas en `2405cae`, incluidos denegación de medios/credenciales y controles táctiles de 44 px. Entregado en PR #10 con CI de producto aprobado.

- [x] Corrección 19/10/2026: implementación, QA y revisión independiente aprobadas; [PR #9](https://github.com/SebaaM/llave-extra/pull/9) abierto contra develop, sin fusionar. CI de producto `2dd1c7e` aprobado; el estado vigente se consulta en el PR. Ver [plan](docs/plans/07-catalogo-publico-gitflow.md) y [verificación](docs/verification/07-catalogo-publico.md). Detenerse antes de E5/E6/F3.
- [x] Corrección Task 1: enrutar backoffice Django por Vite y documentar GitFlow; QA de login real realizado en desarrollo.
- [x] Corrección Task 2: catálogo general público configurable, DTO y medios seguros; ver `docs/api.md` e informe de tarea.
- [x] Corrección Task 3: acreditar consumos directos sin colaborador, validar estrictamente la referencia aportada y exigir beneficio publicado/vigente; ver `docs/plans/04-consumos-creditos.md`.
- [x] Corrección Task 4: portada con beneficios activos, catálogo y red visual configurables, fotos reales, mapa de Ushuaia, consumo directo y retiro de prototipos; QA de escritorio/móvil y revisión independiente aprobadas.
- [x] Corrección Task 6: etiquetas, nombres de modelos y presentación del backoffice Django en español; QA de índice, listado y formulario completada, con identificadores y permisos preservados.

- [x] E1: base reproducible, Docker y comprobaciones sobre PostgreSQL (ver [entrega](docs/plans/01-base-proyecto.md)).
- [x] E2: autenticación y referencias privadas mediante QR de colaborador (implementación local; ver [detalle](docs/plans/02-autenticacion-api.md)).
- [x] E3: prestadores, beneficios, carpetas y permisos para el Cliente (`TOURIST` compatible); Colaborador, Prestador y Administrador con responsabilidades separadas (implementación revisada en `f28e9cb`).
- [x] F1 histórico: tres prototipos se usaron para elegir Beneficios como portada y Pasaporte en Mi viaje. Las rutas y el código demo se retiraron del producto actual; ver [archivo histórico](docs/frontend-prototipos.md).
- [x] E4: consumos únicos, créditos, anulaciones y ajustes pendientes (ver [detalle](docs/plans/04-consumos-creditos.md)).
- [x] E5 backend/API/Admin: tienda, stock, canjes, retiro y pagos recuperables. [PR #11](https://github.com/SebaaM/llave-extra/pull/11) abierto contra develop, sin fusionar; depende de #10. Producto revisado y CI aprobado; sandbox externo pendiente.
- [x] E6: entrega de analítica, seguridad y operación verificada en la rama local. No implica integración o producción.
  - [x] E6.1 integrada en `develop` (PR #30, `d1f181d`): informe de visitas atribuidas en `/gestion`, con filtros, permisos y resguardo ante procedencia DEMO ambigua. [Verificación](docs/verification/17-analitica-e6.md).
  - [x] E6.2: métricas por rol y actividad financiera revisadas localmente; no publicadas.
    - [x] T3: métricas del Prestador con período seleccionable, verificadas en rama local; integración y control visual aún pendientes. [Evidencia](docs/verification/17-analitica-e6.md#e62-t3--métricas-del-prestador).
    - [x] T4: métricas del Colaborador verificadas en la rama local; integración y control visual aún pendientes. [Evidencia](docs/verification/17-analitica-e6.md#e62-t4--métricas-del-colaborador).
    - [x] T5: actividad financiera administrativa con fechas verificables, créditos y ARS separados. [Evidencia](docs/verification/17-analitica-e6.md#e62-t5--actividad-financiera).
  - [x] E6.3: matriz de seguridad, logs de acceso y TLS verificados en laboratorio, con revisión independiente. [Evidencia](docs/verification/17-analitica-e6.md#e63--matriz-integrada-y-laboratorio-tls).
  - [x] E6.4: restauración sintética y scheduler de laboratorio verificados con los límites registrados.
    - [x] T7: respaldo y restauración sintéticos, con límites de TLS del destino, comisiones y duración registrados. [Evidencia](docs/verification/18-operacion-e6.md).
    - [x] T8: scheduler optativo con proveedor simulado; repetición después de interrupción sin duplicar el reintegro o la reposición de stock. [Traspaso](docs/operations/e6-handoff.md).
  - [ ] E6 antes del piloto: HTTPS/SMTP públicos, dispositivos físicos, políticas de respaldo y recuperación, scheduler real y sandbox de pagos. [Checklist](docs/operations/e6-handoff.md).
- [x] Task 8: migrar backend a uv 0.11.3 y frontend a pnpm 11.22.0 con locks, Docker y CI bloqueados (ver [informe](.superpowers/sdd/00-roadmap/task-8-report.md)).
- [x] F2 después de E4: conectar la experiencia Beneficios y Mi viaje estilo Pasaporte a las API E2–E4 (ver [plan frontend](docs/plans/frontend.md) e [informe Task 9](.superpowers/sdd/00-roadmap/task-9-report.md)).
- [ ] Resto de F3 después de E5/E6: tienda/pedidos y analíticas; espacios operativos Prestador/Colaborador adelantados en plan 08, Administrador usa Django. Ver [plan frontend](docs/plans/frontend.md).
- [ ] Validar Mercado Pago con cuentas de prueba y credenciales de su aplicación antes de habilitar operación.
- [ ] Confirmar ofertas, recursos gráficos, contacto y punto de retiro reales antes de publicar.
- [ ] Incorporar vencimiento de créditos mediante una regla prospectiva en una etapa posterior.

- [x] Corrección Task 5: contrato de red visual con configuración administrativa general y privada por carpeta; ver `docs/api.md` e informe Task 5.

- [x] E5 cerrada: dominio/canjes, pagos recuperables y Admin; plan docs/plans/05-tienda-pagos.md y evidencia docs/verification/05-tienda-pagos.md. UI de tienda y E6 quedan después.

- [x] E5 Task 1 a7a6b59 aprobada por revisión independiente sin hallazgos: catálogo/API/Admin, canje E4, cancelación créditos, stock auditado e historia PG protegida; reserva MONEY/outbox sin HTTP. Evidencia en docs/verification/05-tienda-pagos-task-1.md. Task 2 entregada en PR #11 con worker, vencimiento, pasarela y cancelación/refund monetario; gate independiente y CI aprobados. Sandbox externo pendiente. Guía docs/shop-operations.md y evidencia docs/verification/05-tienda-pagos.md.
- [x] E5 fix I1 aprobado en 4c9a402 por re-review focal: reservas impagas en revisión vencen/cancelan y stock previamente acreditado se conserva. Upgrade 0005 y QA HTTP aprobados. Evidencia en docs/verification/05-tienda-pagos.md.


- [ ] Validar el Compose de producción en un servidor con TLS y SMTP reales, backups/restauración y scheduler de tienda.
