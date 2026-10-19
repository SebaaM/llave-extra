# Pendientes

- [x] E1: base reproducible, Docker y comprobaciones sobre PostgreSQL (ver [entrega](docs/plans/01-base-proyecto.md)).
- [x] E2: autenticación y referencias privadas mediante QR de colaborador (implementación local; ver [detalle](docs/plans/02-autenticacion-api.md)).
- [x] E3: prestadores, beneficios, carpetas y permisos para el Cliente (`TOURIST` compatible); Colaborador, Prestador y Administrador con responsabilidades separadas (implementación local, pendiente revisión independiente).
- [ ] E4: consumos únicos, créditos y anulaciones.
- [ ] E5: tienda, Mercado Pago, stock y retiro.
- [ ] E6: analítica, preparación operativa y seguridad.
- [ ] F1: tres prototipos completos y revisados en worktree separado; integrar su rama y pedir elección del usuario antes de conectar la interfaz funcional del Cliente.
- [ ] Migrar herramientas a `uv` (backend) y `pnpm` (frontend) en cambio separado antes de E4, después de integrar F1; E3 usa Docker y dependencias actuales.
- [ ] Validar Mercado Pago con credenciales de sandbox reales antes de producción.
- [ ] Confirmar ofertas, recursos gráficos, contacto y punto de retiro reales antes de publicar.
- [ ] Incorporar vencimiento de créditos mediante una regla prospectiva en una etapa posterior.
