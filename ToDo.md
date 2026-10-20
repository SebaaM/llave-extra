# Pendientes

- [ ] F3 operativo adelantado: dashboards Prestador y Colaborador, barra lateral, un negocio por Prestador y selección concreta de beneficios por Colaborador. Admin en Django; sin tienda ni analíticas. Ver [plan 08](docs/plans/08-backoffice-red.md).

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
- [ ] F3 después de F2: tienda y espacios de Colaborador, Prestador y Administrador; ver [brief F3](.superpowers/sdd/00-roadmap/task-10-brief.md).
- [ ] Validar Mercado Pago con credenciales de sandbox reales antes de producción.
- [ ] Confirmar ofertas, recursos gráficos, contacto y punto de retiro reales antes de publicar.
- [ ] Incorporar vencimiento de créditos mediante una regla prospectiva en una etapa posterior.

- [x] Corrección Task 5: contrato de red visual con configuración administrativa general y privada por carpeta; ver `docs/api.md` e informe Task 5.
