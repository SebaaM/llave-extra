# Verificación — backoffice de tienda y catálogo real

Plan: [backoffice de tienda y catálogo real](../superpowers/plans/2026-11-03-backoffice-tienda-catalogo-real.md). Rama `feature/backoffice-tienda-catalogo` desde `develop`. Este documento distingue comprobaciones concluidas de las pendientes; no acredita pagos externos.

## Antes y después

La tienda mostraba ejemplos estáticos. El catálogo y sus fichas consultan ahora productos publicados, categorías y retiro habilitado de la API. El panel agrega categorías, filtros y orden de productos, stock por movimientos, imagen y umbral configurable. Compra y canje web continúan sin habilitarse; los pedidos históricos conservan sus snapshots.

La migración agrega categorías opcionales y umbral inicial 5, sin asignar categorías a productos existentes. Lista, detalle e imagen públicos comparten la política de categoría activa. Las escrituras preservan la idempotencia de stock y los bloqueos del dominio; los cambios de visibilidad se coordinan con checkout y versiones administrativas.

## Comprobaciones

- PostgreSQL/Redis en proyecto Docker aislado `llaveextra-catalogo`; base habitual sin modificar. `docker compose -p llaveextra-catalogo run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q`: 394 aprobadas antes del ajuste final de orden de precios. Tras el ajuste, `pytest -q shop/tests/test_catalog_admin.py::test_price_order_places_missing_prices_last` aprobó ocho casos; `ruff check .`, `makemigrations --check --dry-run` y `spectacular --file /tmp/schema.yaml --validate --fail-on-warn` aprobaron con el mismo prefijo Docker.
- Frontend: `pnpm test -- --maxWorkers=1` terminó con 368 pruebas y una prueba de proxy aprobadas antes de los ajustes finales de interfaz. Después, `pnpm exec vitest run src/product/admin/ShopAdmin.test.tsx --reporter=dot` aprobó cinco casos focales. `pnpm run lint`, `pnpm run typecheck` y `pnpm run build` terminaron correctamente con esos ajustes.
- QA visual público inicial con un producto sintético en la base aislada: catálogo a 1440×900 y 390×844 y ficha móvil. Se observaron precios disponibles, imagen neutra y aviso de compra/canje pendientes.
- Revisión independiente: se detectaron y corrigieron versiones obsoletas en las categorías y sus productos; la revisión comprobó el orden Product → Category. Se corrigieron además el primer clic de orden, la etiqueta del filtro, respuestas tardías del selector y la posición de precios nulos. La revisión focal posterior no encontró defectos adicionales en esos cambios.

En la revisión inicial, la revisión automática rechazó crear un superusuario sintético para QA del panel por tratarse de acceso privilegiado. La revisión posterior utilizó respuestas de API sintéticas en el navegador. La validación de Mercado Pago sandbox y la programación de workers siguen fuera del alcance.

## Integración con develop

Al abrir el [PR #20](https://github.com/SebaaM/llave-extra/pull/20), `develop` había avanzado a `4bb4300` con el comando de actividad demo. Se incorporó esa base a la rama y se conservaron ambos cambios de documentación. En PostgreSQL/Redis aislados, `pytest -q accounts/tests/test_activity_demo.py shop/tests/test_catalog_admin.py` aprobó 30 pruebas en 296,90 s; Ruff, migraciones sin drift y OpenAPI sin advertencias también aprobaron. El CI del commit anterior `b40f262` terminó correctamente; el CI del nuevo corte debe consultarse en el PR.

## Revisión visual del 05/11/2026

- Dos revisores independientes compararon el frontend antes y después en Edge Chromium con respuestas sintéticas de API. En el panel probaron el listado, la ficha, el alta y la edición de productos, categorías y retiro a 320, 390 y 1440 px. Los encabezados ordenables permanecen disponibles, el clic invierte el orden y actualiza la URL, y el desplazamiento horizontal queda dentro de la tabla. La miniatura y el nombre quedan juntos, los filtros se alinean y la ficha agrupa el ajuste de existencias y su historial.
- En la tienda probaron catálogo y ficha a 320, 390, 768 y 1440 px. Las fotos verticales muestran la pieza completa en el detalle, los precios principales coinciden en altura cuando hay tarjetas en la misma fila y los nombres largos se ajustan al ancho disponible. La ficha presenta un único aviso de compra y canje pendientes.
- `pnpm run lint`, `pnpm run typecheck` y `pnpm run build` aprobaron. `pnpm exec vitest run src/product/admin/ShopAdmin.test.tsx src/product/shop/ShopPage.test.tsx --maxWorkers=1 --reporter=dot` aprobó nueve pruebas focales.
- El ajuste corresponde a presentación y navegación de la interfaz. La QA visual utiliza un servidor de fixtures y el alcance de las comprobaciones PostgreSQL y OpenAPI se registra en las secciones anteriores.

## Navegación lateral local del 05/11/2026

- `docker compose up -d --build --wait` levantó la rama y `docker compose exec -T backend python manage.py migrate --noinput` aplicó `shop.0006_product_categories` al entorno local. `/gestion` devolvió HTTP 200 y `/api/v1/health/` devolvió `ok` desde `localhost:8080`.
- En Edge con respuestas sintéticas, «Mi cuenta» a 1366 × 768 pasó de una página de 879 px y un menú con scroll interno a 768 px y un menú sin desborde. A 1440 × 900 y 1366 × 768 caben todos los enlaces con Tienda desplegada. A 1024 × 600 el menú se desplaza al superar el espacio disponible. A 768 y 390 px de ancho el menú abierto se desplaza con la página y se cierra al elegir un enlace.
- Las URL de lista y ficha mantienen la sección activa. Al volver a la ruta, se vuelve a desplegar su grupo. La organización propuesta usa accesos directos según el flujo operativo previsto.
- Aprobaron `docker compose exec -T frontend pnpm run lint`, `docker compose exec -T frontend pnpm run typecheck`, `pnpm run build` y `docker compose exec -T frontend pnpm exec vitest run src/product/admin/AdminWorkspace.test.tsx --maxWorkers=1 --reporter=verbose` con 10 pruebas.
- La ejecución integral encontró fallos en `QrFlow.test.tsx`. La prueba focal del QR aprobó 35 de 36 casos; el primero tampoco encontró el encabezado esperado en la imagen compilada antes del cambio de menú, mediante `docker run --rm --network none llaveextra-frontend pnpm exec vitest run src/product/QrFlow.test.tsx -t 'redime una vez' --maxWorkers=1 --testTimeout=15000 --reporter=dot`.

## Revalidación del 06/11/2026 sobre develop

- Base `ae0c2bf`, con los PR #20 de catálogo y #21 de seguridad integrados. El CI de #20 aprobó frontend y backend.
- En Docker aprobaron `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:proxy`, `pnpm exec vitest run src/product/admin src/product/workspace/Workspace.test.tsx --maxWorkers=2 --testTimeout=20000 --reporter=dot` con 93 pruebas, y `pnpm run build`.
