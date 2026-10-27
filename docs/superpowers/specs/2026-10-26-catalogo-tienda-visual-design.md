# Tienda: catálogo visual de ejemplo

Pedido del usuario: «quiero hacer la tienda, pero solo el catalogo visual, con ejemplos cargados». Adelanta exclusivamente esta parte de F3; E6, checkout y pedidos del Cliente continúan pendientes.

Crear `/tienda` pública y detalles `/tienda/:slug`, integrados en la navegación actual, con identidad Llave Extra. Nueve productos ficticios de regalería 3D inspirados en Ushuaia, ilustraciones SVG propias, descripción y valores ilustrativos en ARS/créditos. Identificar la demostración en catálogo y detalle; no presentar imágenes como fotografías ni disponibilidad comercial confirmada.

Decisión de implementación: datos estáticos tipados junto al frontend, sin seed ni escrituras/API de tienda. Permite evaluar la UI conservando los datos locales existentes. Conectar el catálogo real será otra entrega. Se reutilizan shell, fuentes y colores; no se crean nuevos prototipos.

Interacciones: búsqueda insensible a acentos, filtro por tres categorías, orden por precio/créditos y paginación de seis elementos; reset de página al modificar filtros. Estado vacío con restauración de filtros, detalle y ficha inexistente. Accesible desde navegación y Mi viaje; diseño adaptable a 320 px. Sin carrito, pagos, reservas, acreditaciones ni canjes. No consultar ni simular saldo del Cliente.

Verificar filtros combinados, segunda página, detalle/URL inválida, acceso anónimo y ausencia de llamadas financieras. Ejecutar lint, tipos, suite frontend/proxy y build; revisar escritorio/móvil. Backend y OpenAPI no cambian. GitFlow, commits en español, PR a develop sin fusionar; base actual del panel Admin y dependencia de PR #12 explícitas.
