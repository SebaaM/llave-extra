# Plan de ajustes de la vista del Cliente

> Ejecución con superpowers:subagent-driven-development: implementadores acotados y revisores independientes, sin delegación secundaria.

**Objetivo:** aplicar el diseño aprobado por el usuario, con lenguaje cotidiano, navegación adaptable e inicio ordenado.

**Arquitectura:** evolucionar componentes React existentes, sin nuevas dependencias ni cambios de autorización o contratos del servidor. Historial con iniciales de nombres ya disponibles. CSS acotado al producto.

**Tecnologías:** React, TypeScript, Tailwind/CSS y pnpm existentes.

**Diseño:** [ajustes aprobados](../specs/2026-10-30-ajustes-vista-cliente.md).

## Restricciones y revisión

- El Cliente solo recibe recomendaciones autorizadas; no gestiona carpetas ni recomienda. El enlace depende de selecciones recibidas vigentes, sin ampliar permisos.
- Contenido privado, sesiones, blobs y reintentos conservan sus guardas. Ningún logo se busca en el catálogo para completar el historial.
- Barra móvil y navbar escritorio, red/lista según ancho; sin duplicación accesible ni foco perdido al cambiar tamaño.
- Carrusel con controles, resultados vigentes y limpieza al apagar catálogo; sin movimiento automático obligatorio.
- Sin jerga de roles o carpetas en la presentación del Cliente. Cambios de textos conservan el significado de QR, PIN y consumo directo.

## Tarea A: navegación, red y lenguaje

Archivos: `frontend/src/product/Layout.tsx`, `navigation/ClientNavigation.tsx`, `NetworkCanvas.tsx`, `ProductApp.tsx`, `BenefitsPages.tsx`, textos de referencia/consumo y `ui/client.css`; pruebas correspondientes.

Interfaz: ProductShell y ClientNavigation reciben `hasRecommendations?: boolean`, con valor explícito desde estado de recomendaciones autorizado de ProductApp. Red usa un único modo derivado de `matchMedia` en 680 px, con suscripción y retirada de escucha; conservar datos y permisos.

- [x] Agregar pruebas de enlace condicional, modo por viewport/cambio de tamaño, ausencia de selector y lenguaje sin roles/carpetas. Ejecutar RED.
- [x] Implementar enlaces de escritorio en navbar, barra solo móvil, y red/lista automáticas. Mantener foco y navegación nativa.
- [x] Ajustar textos del Cliente para recomendaciones recibidas y visitas sin referencia, sin cambiar operaciones de roles administrativos.
- [x] Ejecutar pruebas focales, lint/tipos/build; revisión y corrección si corresponde; commit en español. Producto A: `f3dc517`, correcciones `f5eca32` y `7852c3e`.

## Tarea B: inicio y pasaporte

Archivos: `HomePage.tsx`, nuevo `FeaturedBenefits.tsx`, `HowItWorks.tsx`, `journey/Passport.tsx`, `JourneyPage.tsx`, `ui/client.css`, pruebas.

Interfaz: `FeaturedBenefits({benefits}: {benefits: PublicBenefit[]})`, selección en memoria, controles anterior/siguiente accesibles; avance manual para evitar complejidad innecesaria de pausas. Se desmonta al recargar/desactivar el catálogo. Pasaporte conserva `history: Consumption[]` y presenta iniciales derivadas del nombre actual recibido.

- [x] Probar orden Hero/Red/Recorrido/Próxima parada/Mapa/Pasaporte, carrusel con más de un beneficio, catálogo desactivado, sellos con nombre ausente/anulado/largo, historial y billetera. Ejecutar RED.
- [x] Reordenar secciones, explicar QR opcional con lenguaje cotidiano e implementar carrusel manual.
- [x] Presentar libreta abierta con sellos pequeños de iniciales, historial y barra autoritativos, adaptación móvil y movimiento reducido.
- [x] Ejecutar suite frontend, lint/tipos/build y revisión de B; commit `06afb43`, 303 pruebas UI + 1 proxy aprobadas.
- [x] Corregir I1/I2 de la revisión integral en `1ff72fd`, verificar su delta mediante revisión independiente y registrar documentación antes/después. Suite final: 308 UI + 1 proxy, lint/tipos/build aprobados. [Evidencia](../../verification/13-ajustes-vista-cliente.md).
- [x] Preparar los commits y la documentación para actualizar PR #16 en borrador, sin fusionar. La publicación de cada revisión y su CI se consultan en la PR; aprobación final del cliente pendiente.
