# Verificación del rediseño de la vista del turista

El inicio, el catálogo y el detalle de beneficio comparten el mismo diseño y contenido para visitantes y todos los roles. La portada del catálogo enlaza al listado de beneficios; el registro y los accesos a Mi viaje y a los paneles se ofrecen según el rol en la navegación. Los filtros, las condiciones y las imágenes de las ofertas siguen usando el catálogo vigente. El inicio conserva los destacados seleccionados desde Administración y no consulta el progreso ni los créditos personales.

La tienda, los paneles operativos y el backend quedan fuera del alcance. Tampoco se incluyen el prototipo estático ni sus ofertas de ejemplo o sus imágenes adicionales.

## Comprobaciones

- `pnpm run lint` y `pnpm run build`: completados sin errores.
- `pnpm exec vitest run src/product/CatalogOnly.test.tsx src/product/ProductApp.test.tsx src/product/CatalogPages.test.tsx src/product/HomePage.test.tsx src/product/FeaturedBenefits.test.tsx --maxWorkers=2 --testTimeout=25000`: 65 pruebas aprobadas sobre `develop` en `143e159`; incluyen inicio y catálogo sin sesión y para los cuatro roles.
- En el laboratorio local se comprobó con una sesión de Colaborador que el catálogo muestra beneficios publicados y que el botón «Ver beneficios» lleva al listado. El inicio mantiene el acceso «Mi espacio» en la navegación y no muestra datos personales de Mi viaje.
