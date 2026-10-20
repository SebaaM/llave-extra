# Pendientes

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
- [ ] E5: tienda, Mercado Pago, stock y retiro.
- [ ] E6: analítica, preparación operativa y seguridad.
- [x] Task 8: migrar backend a uv 0.11.3 y frontend a pnpm 11.22.0 con locks, Docker y CI bloqueados (ver [informe](.superpowers/sdd/00-roadmap/task-8-report.md)).
- [x] F2 después de E4: conectar la experiencia Beneficios y Mi viaje estilo Pasaporte a las API E2–E4 (ver [plan frontend](docs/plans/frontend.md) e [informe Task 9](.superpowers/sdd/00-roadmap/task-9-report.md)).
- [ ] Resto de F3 después de E5/E6: tienda/pedidos y analíticas; espacios operativos Prestador/Colaborador adelantados en plan 08, Administrador usa Django. Ver [plan frontend](docs/plans/frontend.md).
- [ ] Validar Mercado Pago con credenciales de sandbox reales antes de producción.
- [ ] Confirmar ofertas, recursos gráficos, contacto y punto de retiro reales antes de publicar.
- [ ] Incorporar vencimiento de créditos mediante una regla prospectiva en una etapa posterior.

- [x] Corrección Task 5: contrato de red visual con configuración administrativa general y privada por carpeta; ver `docs/api.md` e informe Task 5.

- [ ] E5 en curso por pedido del 20/10: dominio/canjes, pagos recuperables y Admin; plan docs/plans/05-tienda-pagos.md. UI de tienda y E6 quedan después.

