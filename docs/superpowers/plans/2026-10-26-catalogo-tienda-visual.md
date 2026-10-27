# Plan de implementación: catálogo visual de tienda

**Objetivo:** entregar únicamente el catálogo visual solicitado con ejemplos cargados.

**Arquitectura:** página React pública, datos estáticos tipados e ilustraciones SVG locales. Reutilizar ProductShell y ProductLink; sin endpoints nuevos, seeds ni dependencias.

**Stack:** React, TypeScript y CSS en el frontend Tailwind existente; pnpm y Docker.

**Spec:** [diseño](../specs/2026-10-26-catalogo-tienda-visual-design.md).

## Tarea única: catálogo navegable

Archivos nuevos: `frontend/src/product/shop/{examples.ts,ProductArt.tsx,ShopPage.tsx,shop.css,ShopPage.test.tsx}`. Integración en `ProductApp.tsx`, `Layout.tsx` y `JourneyPage.tsx`.

- [x] Crear nueve ejemplos tipados, tres categorías e ilustraciones propias reutilizables.
- [x] Implementar `ShopPage` y `ShopDetail({slug})`, públicas, sin acceso a API o almacenamiento; búsqueda/filtros/orden/paginación y estado vacío.
- [x] Agregar navegación y acceso desde Pasaporte; conservar controles de sesión existentes.
- [x] Verificar búsqueda con acentos, filtro desde página dos, resultados vacíos, orden, ficha inexistente y navegación anónima sin llamadas de tienda.
- [x] Ejecutar frontend lint, tipos, pruebas y build. QA visual en escritorio/320 px; registrar alcance/evidencia.
- [x] Revisión independiente focal, actualizar contexto/ToDo/roadmap y documentación; commit y PR GitFlow hacia develop sin fusionar.

Focos: precios de muestra inequívocos; filtros no dejan página vacía inválida; SVG sin IDs duplicados; datos estáticos no mezclados con stock/saldo real; detalle público accesible sin restauración de sesión.
