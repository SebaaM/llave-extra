# Verificación — backoffice de tienda y catálogo real

Plan: [backoffice de tienda y catálogo real](../superpowers/plans/2026-11-03-backoffice-tienda-catalogo-real.md). Rama `feature/backoffice-tienda-catalogo` desde `develop`. Este documento distingue comprobaciones concluidas de las pendientes; no acredita pagos externos.

## Antes y después

La tienda mostraba ejemplos estáticos. El catálogo y sus fichas consultan ahora productos publicados, categorías y retiro habilitado de la API. El panel agrega categorías, filtros y orden de productos, stock por movimientos, imagen y umbral configurable. Compra y canje web continúan sin habilitarse; los pedidos históricos conservan sus snapshots.

La migración agrega categorías opcionales y umbral inicial 5, sin asignar categorías a productos existentes. Lista, detalle e imagen públicos comparten la política de categoría activa. Las escrituras preservan la idempotencia de stock y los bloqueos del dominio; los cambios de visibilidad se coordinan con checkout y versiones administrativas.

## Comprobaciones

- PostgreSQL/Redis en proyecto Docker aislado `llaveextra-catalogo`; base habitual sin modificar. `docker compose -p llaveextra-catalogo run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q`: 394 aprobadas antes del ajuste final de orden de precios. Tras el ajuste, `pytest -q shop/tests/test_catalog_admin.py::test_price_order_places_missing_prices_last` aprobó ocho casos; `ruff check .`, `makemigrations --check --dry-run` y `spectacular --file /tmp/schema.yaml --validate --fail-on-warn` aprobaron con el mismo prefijo Docker.
- Frontend: `pnpm test -- --maxWorkers=1` terminó con 368 pruebas y una prueba de proxy aprobadas antes de los ajustes finales de interfaz. Después, `pnpm exec vitest run src/product/admin/ShopAdmin.test.tsx --reporter=dot` aprobó cinco casos focales. `pnpm run lint`, `pnpm run typecheck` y `pnpm run build` terminaron correctamente con esos ajustes.
- QA visual público con un producto sintético en la base aislada: catálogo a 1440×900 y 390×844 y ficha móvil. Se observaron precios disponibles, imagen neutra y aviso de compra/canje pendientes. La revisión visual del panel administrativo sigue pendiente.
- Revisión independiente: se detectaron y corrigieron versiones obsoletas en las categorías y sus productos; la revisión comprobó el orden Product → Category. Se corrigieron además el primer clic de orden, la etiqueta del filtro, respuestas tardías del selector y la posición de precios nulos. La revisión focal posterior no encontró defectos adicionales en esos cambios.

La revisión automática rechazó crear un superusuario sintético para QA del panel por tratarse de acceso privilegiado. No se creó esa cuenta ni se probó el panel en navegador. La validación de Mercado Pago sandbox y la programación de workers siguen fuera del alcance.
