# Implementación de destacados del hero

**Objetivo:** hero controlado por destacados del Administrador, sin reemplazar el catálogo ni las selecciones QR privadas.

**Arquitectura:** atributo booleano en Benefit, comando Admin existente y filtro público antes de paginar. Carrusel con índice global controlado y carga de la página necesaria; no descargar todas las ofertas ni fijar una lista local.

**Diseño:** [pedido y decisiones](../specs/2026-11-01-destacados-hero.md). Ejecución integrada en el [plan contextual](2026-10-30-seleccion-qr-contextual.md), mediante subagentes acotados/revisores independientes, misma rama y PR en borrador.

## F1 — Backend

- [x] RED: `Benefit.featured` false por defecto; Admin puede editar y Prestador no, versión/auditoría y rechazo 409 sin duplicar efecto; filtro público true/false válido, inválido 400, publicaciones/vigencias/interruptor y paginación >24.
- [x] `backend/providers/models.py` + migración nueva: `featured = models.BooleanField("Destacado en el inicio", default=False)`. No seed ni migración que elija ofertas. `providers/admin.py`: lista/filtro/campo en ficha.
- [x] `backend/administration/resource_serializers.py`: featured solo DTO y escritura Admin; los serializers privados/públicos y escritura propia Prestador no necesitan exponer la marca. Digest Admin concreto ya incluye campos persistidos: comprobarlo. PATCH de ficha y auditoría existentes, sin nuevas rutas ni motor de comandos; versión antigua 409, no prometer replay exitoso del PATCH.
- [x] `backend/providers/catalog_views.py`: parámetro booleano opcional `featured`, aceptar solo true/false, filtrar antes de ordenar/paginar; ausente conserva catálogo completo. OpenAPI y docs/api.md alineados.
- [x] Pruebas PostgreSQL con `--ds=config.settings.test`, Ruff/esquema/drift, autorrévision, commit propio y revisión independiente.

## F2 — Frontend

Pedido adicional del usuario: incorporar «Cómo funciona» al catálogo de beneficios y explicar que las visitas confirmadas generan créditos para canjear en la tienda web. Reutilizar `HowItWorks` con variante de título para el catálogo, después de resultados/paginación y un enlace nativo de salto junto a la introducción, sin alterar el orden del inicio. La explicación de créditos debe ser visible sin abrir un paso, mantener la acreditación única por negocio y enlazar `/tienda`. Como la tienda actual es un catálogo de ejemplo, indicar brevemente que el canje aún no está habilitado; no ofrecer un botón de canje ni implementar compras en este alcance. Sin lecturas privadas adicionales.

- [x] `frontend/src/product/admin/data.ts`: casilla featured, columna/detalle y etiqueta «Destacado en el inicio»; reutilizar formulario/comandos existentes. Solo Admin, no espacio Prestador.
- [x] `catalog.ts` / `usePublicCatalog.ts`: opción featured incluida en identidad de solicitud y query, preservando contratos existentes.
- [x] `HomePage.tsx` / `FeaturedBenefits.tsx`: consulta solo destacados. Índice global, página calculada con 24 por página, botones anterior/siguiente y selectores accesibles que no omitan resultados posteriores a página 1. No avance automático; limpiar tarjeta al recargar/cambiar consulta; clamp/reset controlado si total cambia, sin bucle de 404.
- [x] Cero destacados sin fallback, uno sin navegación innecesaria, error/reintento, cambio de datos y respuestas tardías. Red/categorías/catálogo completo conservan su política y orden del inicio.
- [x] `HowItWorks.tsx`, sus pruebas y `CatalogPages.tsx/test`: sección en catálogo con título «Cómo funciona», salto accesible, pasos existentes interactivos, créditos y propósito de canje visibles, enlace a tienda con estado real; casos de resultados/carga/error/catálogo apagado sin nuevas solicitudes privadas. Inicio conserva título y orden vigentes.
- [x] RED/GREEN, suite frontend, lint/tipos/build; commit y revisión independiente. El cierre documental, QA disponible y nueva PR hacia develop se registran en D del plan contextual; PR #16 ya fue integrada externamente.
