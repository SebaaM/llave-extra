# Cliente con catálogo único

Decisión vigente del usuario: quitar la sección Recomendaciones del Cliente porque ya dispone del catálogo de beneficios. Esta decisión sustituye la pantalla propia y el enlace condicional aprobados anteriormente.

Precisión posterior que modifica este plan: mantener una selección contextual tras abrir el QR e iniciar sesión, con nombre del colaborador y sus negocios/beneficios; registrar vínculo para resumen y atribuir visitas, sin una colección permanente del turista. La implementación de este corte quedó interrumpida para incorporar [el diseño contextual](../specs/2026-10-30-seleccion-qr-contextual.md). Los pasos siguientes describen el corte anterior y no autorizan eliminar la vista contextual por QR.

## Alcance

- Navbar de escritorio: Beneficios, Tienda, Cómo funciona, Mi viaje y Cuenta. Barra móvil: Beneficios y Mi viaje; menú móvil conserva Tienda, Cuenta y Cómo funciona.
- Ruta histórica `/recomendaciones` y sus variantes normalizadas llevan a `/beneficios`, sin exigir autenticación ni consultar detalles privados. No se convierten datos privados en catálogo público.
- QR de entrada conserva redención, intención durante login y asociación autorizada. Sus botones continúan al catálogo, sin pantalla de recomendaciones ni comprobaciones de disponibilidad para mostrar un enlace.
- Consumo conserva modos directo/referido, QR/PIN, idempotencia, sesión y validación del servidor. Sigue usando los accesos recibidos mediante QR cuando se aporta una referencia; no degradar una referencia inválida a directo.
- Retirar de ProductApp estado/carga/detalle de la antigua sección y probes de network dedicados a su visibilidad. `loadFolders` mantiene cercas de petición, sesión y cuenta para el consumo.
- Textos del inicio, recorrido y QR explican el catálogo y el QR opcional sin prometer una sección retirada. Los espacios de Colaborador/Prestador y el backend no cambian.

## Implementación y comprobación

Archivos: navegación, Layout, ProductApp, ReferencePage, textos HomePage/HowItWorks/CatalogPages/ConsumptionPage según corresponda, pruebas y CSS de la barra si necesita ajuste. Revisar y retirar componentes exclusivos de la sección eliminada si quedan sin consumidores; no borrar funcionalidades compartidas por otros roles.

1. Probar ausencia de enlaces y pantalla para Cliente con/sin accesos QR en desktop/móvil; probar que ruta antigua conduce al catálogo y no llama providers/network privados.
2. Simplificar navegación/estado/QR y sustituir las regresiones de la sección retirada por cobertura del catálogo único. Conservar pruebas de autenticación, cambio de cuenta, viaje y consumo.
3. Ejecutar pruebas focales y suite frontend, lint, tipos y build. Revisar independientemente el delta de autenticación/QR/consumo y el retiro de estado privado.
4. Documentar antes/después y decisión vigente en CONTEXT, instrucciones, pendientes y evidencia. Commit y actualización de PR #16 en borrador, sin merge.
