# Verificación: catálogo visual de tienda — 26/10/2026

## Alcance y base

Pedido: tienda solo catálogo visual con ejemplos. Rama `feature/catalogo-tienda-visual`, base `d87a039` de `feature/panel-admin`. Consulta GitHub: PR #12 abierto, sin fusionar, base develop y head d87a03990e2246b6920741b1ae53a9ae0bf46db9. Se conserva dependencia; no se fusiona ningún PR.

Nueve ejemplos estáticos tipados e ilustraciones propias en `frontend/src/product/shop/`. Catálogo público `/tienda`, detalle `/tienda/:slug`, búsqueda sin acentos, categorías, orden por precio/créditos, paginación 6+3, vacío y URL inválida. Integración en menú y Pasaporte. ARS/créditos identificados como valores ilustrativos.

Sin nuevas dependencias, backend, migraciones, API, seed, pagos, reservas, canjes, pedidos o actualización de la base existente. No se ejecuta suite PostgreSQL porque esta entrega no modifica backend/contrato. No declara validación externa de Mercado Pago. La autenticación global sigue funcionando; no se consulta saldo/progreso/historial al restaurar una sesión desde tienda.

## Comprobaciones ejecutadas

Prefijo Docker: `docker compose exec -T frontend`.

| Comando | Resultado |
| --- | --- |
| `pnpm run lint` | Exit 0 en versión final |
| `pnpm run typecheck` | Exit 0 en versión final |
| `pnpm run build` | Exit 0; Vite compila 79 módulos |
| `pnpm test` | 122 UI en 11 archivos + 1 proxy aprobados |
| `pnpm exec vitest run src/product/shop/ShopPage.test.tsx src/product/ProductApp.test.tsx` | 15 aprobadas después del último ajuste de desplazamiento |
| `git diff --check` | Sin errores; advertencia de normalización CRLF/LF en archivos existentes |

La suite completa incluye el aislamiento de saldo y navegación anónima/autenticada. Después se corrigió únicamente el desplazamiento al montar catálogo/detalle; se repitieron las 15 pruebas afectadas más lint/tipos/build. No se atribuye la suite completa a un corte posterior a ese último ajuste.

## QA de navegador real

In-app browser contra `http://localhost:5173/tienda`, sin cuenta:

- Página 1 muestra seis productos; Siguiente muestra tres, cambia a «Página 2 de 2» y deshabilita Siguiente. Anterior recupera la primera.
- Buscar `pinguino` desde la segunda página muestra ambos pingüinos y restablece «Página 1 de 1».
- Fichas de Pingüino y Faro abren con su ilustración, descripción, valores y medidas de ejemplo; volver al catálogo funciona.
- Escritorio de 1280×900 y móvil de 320×800. En móvil, `documentElement.scrollWidth` y `clientWidth` coinciden (305 px útiles con scrollbar); no hay desbordamiento horizontal en catálogo/detalle.
- Se observó y corrigió desplazamiento heredado al navegar entre catálogo y ficha; `usePageStart` lleva al comienzo del contenido. Confirmado nuevamente en móvil.
- Título de documento y aviso de vista previa visibles. Sin botones de comprar/canjear ni invocaciones financieras.

Captura local de apoyo: `work/catalogo-tienda.png` (ignorada, no es evidencia de datos reales).

## Revisión independiente

Revisor `shop_visual_review`, modelo económico, solo lectura. Detectó precarga de wallet/progreso/historial desde la shell al restaurar Cliente en tienda; se agregó guarda de ruta y dos regresiones integradas. Revisión focal confirmó cierre y ausencia de otros problemas en ese cambio. No se reconstruyó la autenticación ni se alteraron servicios financieros.

## Pendientes fuera de esta entrega

Integración con productos/medios de API, administración del inventario de ejemplos, carrito, compra/canje, pedidos del Cliente, validación sandbox externa, E6 y auditoría activa. La vista previa no representa disponibilidad ni precios comerciales confirmados. Revisar los ejemplos con el usuario antes de convertirlos en productos reales.
