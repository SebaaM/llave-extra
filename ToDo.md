# Pendientes

- [ ] Corrección 19/10/2026: GitFlow, ingreso admin, catálogo público configurable y portada con beneficios activos; retirar prototipos y permitir consumos sin colaborador. Ver [plan](docs/plans/07-catalogo-publico-gitflow.md).
- [x] Corrección Task 1: enrutar backoffice Django por Vite y documentar GitFlow; QA de login real realizado en desarrollo.
- [x] Corrección Task 2: catálogo general público configurable, DTO y medios seguros; ver `docs/api.md` e informe de tarea.
- [x] Corrección Task 3: acreditar consumos directos sin colaborador, validar estrictamente la referencia aportada y exigir beneficio publicado/vigente; ver `docs/plans/04-consumos-creditos.md`.

- [x] E1: base reproducible, Docker y comprobaciones sobre PostgreSQL (ver [entrega](docs/plans/01-base-proyecto.md)).
- [x] E2: autenticación y referencias privadas mediante QR de colaborador (implementación local; ver [detalle](docs/plans/02-autenticacion-api.md)).
- [x] E3: prestadores, beneficios, carpetas y permisos para el Cliente (`TOURIST` compatible); Colaborador, Prestador y Administrador con responsabilidades separadas (implementación revisada en `f28e9cb`).
- [x] F1: tres prototipos navegables de demostración integrados. Elección confirmada: Beneficios como dirección principal y Pasaporte en Mi viaje. La API sigue pendiente para la experiencia funcional (ver [comparador](docs/frontend-prototipos.md) y [plan frontend](docs/plans/frontend.md)).
- [x] E4: consumos únicos, créditos, anulaciones y ajustes pendientes (ver [detalle](docs/plans/04-consumos-creditos.md)).
- [ ] E5: tienda, Mercado Pago, stock y retiro.
- [ ] E6: analítica, preparación operativa y seguridad.
- [x] Task 8: migrar backend a uv 0.11.3 y frontend a pnpm 11.22.0 con locks, Docker y CI bloqueados (ver [informe](.superpowers/sdd/00-roadmap/task-8-report.md)).
- [x] F2 después de E4: conectar la experiencia Beneficios y Mi viaje estilo Pasaporte a las API E2–E4 (ver [plan frontend](docs/plans/frontend.md) e [informe Task 9](.superpowers/sdd/00-roadmap/task-9-report.md)).
- [ ] F3 después de F2: tienda y espacios de Colaborador, Prestador y Administrador; ver [brief F3](.superpowers/sdd/00-roadmap/task-10-brief.md).
- [ ] Validar Mercado Pago con credenciales de sandbox reales antes de producción.
- [ ] Confirmar ofertas, recursos gráficos, contacto y punto de retiro reales antes de publicar.
- [ ] Incorporar vencimiento de créditos mediante una regla prospectiva en una etapa posterior.
