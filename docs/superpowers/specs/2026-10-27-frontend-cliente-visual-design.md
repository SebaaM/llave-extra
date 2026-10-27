# Propuesta de diseño: experiencia visual e interactiva del Cliente

**Fecha:** 27/10/2026. **Estado:** propuesta visual pendiente; backend API implementado en alcance parcial según pedido posterior. [Evidencia API](../../verification/12-api-cliente-visual.md).

**Pedido:** preparar un plan de implementación a partir de las recomendaciones visuales del chat. La dirección guía turística + pasaporte es una propuesta del asistente, todavía no una decisión visual confirmada por el usuario.

**Pedido posterior — API primero:** el usuario autoriza ejecutar categorías públicas completas y `provider_name` en historial propio, con pruebas y contrato. Esta entrega no implementa pantallas ni confirma todavía la dirección visual. Base de ejecución API: `develop` actualizado en `754982d`, en rama independiente de los PR de panel Admin y tienda visual.

## Intención y enfoques

Hacer más atractivo y fácil de recorrer el frontend del Cliente: descubrir beneficios, entender la diferencia entre los QR y consultar visitas/créditos. Conservar Beneficios como experiencia principal y Pasaporte en Mi viaje.

Enfoques considerados:

| Enfoque | Aporte | Costo o límite |
| --- | --- | --- |
| Guía turística visual | Descubrimiento por fotos y categorías | Menor identidad en el seguimiento personal |
| Pasaporte interactivo | Sellos y progreso reconocibles | Necesita un catálogo claro para no esconder beneficios |
| Club de beneficios | Ofertas rápidas de consultar | Da menos protagonismo al destino y al viaje |

Propuesta de trabajo: combinar guía turística y pasaporte, con una interacción protagonista por sección. Tomar esta combinación como supuesto revisable del plan, no como aprobación de producto.

## Base y alcance

Base inspeccionada: rama local `feature/catalogo-tienda-visual`, árbol limpio antes de esta documentación. `CONTEXT.md` registra el catálogo visual de tienda entregado en PR #13, dependiente de #12; comprobar estado real de integración antes de ejecutar. No se consultó el estado remoto durante esta planificación.

Entrega principal: presentación, navegación e interacciones de Inicio, Beneficios/detalle, red, recomendaciones privadas, Mi viaje, referencia QR, consumo, autenticación/perfil y tienda de ejemplo. El usuario autorizó incorporar funciones API cuando sean la solución correcta. Se proponen categorías públicas completas para los filtros/Inicio y nombre del comercio en el historial privado propio. No requieren migraciones ni modificar modelos; cualquier otra extensión debe justificar necesidad, permisos y pruebas dentro del alcance visual.

Ampliaciones separadas: favoritos persistentes, nombres/notas de colaboradores, datos comerciales adicionales, mapa geográfico con pines y visor 3D real. Necesitan especificación y autorización de su alcance antes de implementarse. Checkout, pedidos del Cliente, analíticas E6 y sandbox de pagos continúan en sus etapas existentes.

## Reglas visuales propuestas

- Conservar verde petróleo, naranja, fondos arena y fotografías autorizadas de Ushuaia. Mantener fuentes e identidad existentes.
- Variables CSS con prefijo `--client-`, aplicadas bajo `.product-shell`; clases nuevas `client-*`. No cambiar globalmente `.button`, `body` ni los estilos de `/gestion` o espacios operativos.
- Referencias iniciales: petróleo `#16464a`, naranja `#e9780c`, arena `#fcf8ef`. Para texto/enlaces usar tonos oscuros que pasen contraste, no asumir que el naranja decorativo sirve para texto pequeño.
- Espaciado en escala 4/8/12/16/24/32/48/64 px; tarjetas con foto de proporción estable, borde discreto y estados de foco/selección claros.
- Controles táctiles de al menos 44 × 44 px, foco visible y contraste de texto normal de al menos 4.5:1.
- Microinteracciones de 160–220 ms en opacidad/transformación; estampado de hasta 450 ms. Desactivar movimiento no esencial con `prefers-reduced-motion`; nunca ocultar contenido por falta de animación o JavaScript de observación.
- Sin carrusel nuevo automático, parallax ni biblioteca de animación en la entrega principal. Conservar y verificar las pausas de la red existente.

## Comportamiento por sección

| Sección | Entregable | Fuente o límite |
| --- | --- | --- |
| Navegación | Cabecera compacta; barra inferior Cliente con Beneficios, Recomendaciones y Mi viaje; menú nativo desplegable para Tienda/Cuenta | Solo Cliente autenticado en pantallas de producto; ocultar barra durante ingreso de PIN/credenciales |
| Inicio | Beneficio como postal, selector por categorías, recorrido de cuatro pasos y resumen personal opcional | Textos de `SiteSettings`; resumen solo si ya hay wallet/progress vigentes en memoria; no disparar consultas nuevas para mostrarlo |
| Catálogo | Categorías completas, búsqueda, filtros activos, limpiar y paginación reflejados en URL | API nueva de categorías + endpoints existentes; sin favoritos ni porcentajes inferidos |
| Detalle | Qué obtenés / Cómo usarlo / Dónde encontrarlo, copiar dirección, mapa y condiciones | Solo campos existentes; condiciones esenciales visibles; enlaces externos por `safeExternal` |
| Red | Selector Red/Lista, seleccionar nodo y ficha previa en flujo normal | Mismos resultados autorizados de la página; no simular un filtro global con datos parciales |
| Recomendaciones | Cabecera de selección privada, tarjetas postales y categorías del listado recibido | Conservar identificador de carpeta actual; no inventar nombre del colaborador ni revelar su email |
| Mi viaje | Selector Pasaporte/Historial, sellos con comercio, progreso y saldo | `Consumption`, `Progress`, `Wallet`; agregar nombre del comercio al historial propio, sin resolverlo mediante catálogo público |
| QR/consumo | Secuencia de estados, PIN único y resultado confirmado con estampado breve | Respuesta de consumo existente; referencia QR abre carpeta y nunca acredita consumo |
| Acceso/perfil | Mostrar/ocultar contraseña, errores locales de campos y email verificado/pendiente | Mantener respuestas genéricas del servidor y registro exclusivamente Cliente |
| Tienda | Tarjetas de colección, ampliación de ilustración y medidas visibles | Nueve ejemplos SVG; zoom no representa rotación 3D; conservar avisos y ausencia de compra/canje |

En Mi viaje los sellos diferencian `VALID` y `ANNULLED` con texto e icono, además de color. `progress.total`, `target`, `completed` y `wallet.balance` son autoritativos; no sumar ni modificar saldo en cliente. Sin datos se muestra carga/no disponible, no cero. Gastar créditos no elimina visitas. Los sellos históricos no celebran de nuevo al recargar; la animación de éxito vive en el resultado confirmado de consumo.

## Contratos e invariantes

Contrato implementado en el corte API: `GET /api/v1/catalog/categories/` → `200 {"results": ["Categoría"]}`. Lista completa de categorías distintas exactas, no vacías, de `catalog_benefits()`, independiente de búsqueda/página; valores originales utilizables en el filtro `category` existente. Orden determinista por valor sin distinguir mayúsculas y desempate por valor original. No normalizar ni migrar el catálogo. Catálogo deshabilitado → 404; `Cache-Control: no-store`; respuesta anónima sin relaciones privadas, conteos, QR ni credenciales. Esquema OpenAPI documentado en la entrega backend.

Precisión de compatibilidad durante implementación API: el filtro de beneficios busca primero la categoría exacta recibida sin distinguir mayúsculas. Si el valor tiene espacios externos y no existe esa categoría exacta en el catálogo elegible, conserva el comportamiento histórico buscando el valor recortado. Esta decisión se toma antes de aplicar búsqueda textual; una búsqueda sin coincidencias no cambia de categoría. Un parámetro compuesto solo por espacios sigue equivalendo a no filtrar. No se reescriben datos.

Extensión aditiva implementada en el corte API: cada elemento de `GET /api/v1/me/consumptions/` agrega `provider_name: string`, exclusivamente para el Cliente propietario según permisos actuales. Es el nombre actual del comercio relacionado, no un snapshot de cómo se llamaba al consumir. Incluye visitas válidas/anuladas y conserva historial aunque el comercio deje de publicarse o el catálogo se apague; no habilita ficha, imagen ni carpeta por ese hecho. Usar `select_related("provider")` para evitar N+1. El POST de consumo y sus resultados idempotentes no cambian. En su etapa pendiente el frontend admitirá ausencia del campo durante transición y mostrará «Visita verificada/anulada», sin buscar el nombre en un catálogo público.

La selección de filtros públicos vive en `?search=&category=&page=`; URLs directas, atrás/adelante y reinicio a página 1 funcionan. QR, PIN, tokens, carpetas, saldo e historial no se persisten en URL ni almacenamiento nuevo. Una categoría guardada en URL puede dejar de estar disponible: conservar el filtro visible, permitir quitarlo y mostrar el resultado del servidor.

`FolderBenefit` sigue siendo canónico. Las fichas privadas y sus fotos usan las rutas autorizadas actuales; no sustituirlas por las públicas. Al cambiar carpeta, sesión o recibir denegación se desmonta la ficha previa. Conservar validaciones del servidor, política de medios, estados de red y guardas contra respuestas tardías.

La acreditación requiere QR/PIN válidos, Cliente activo y email verificado. Referencia inválida no degrada a directo. Mantener clave/cuerpo en reintento incierto y una única solicitud en vuelo; no introducir persistencia de secretos. Congelación de créditos se muestra sin habilitar un canje.

## Aceptación y decisiones del implementador

- Recorrer todas las secciones en 320, 390, 768 y 1440 px, con teclado y reducción de movimiento. Sin scroll horizontal de página ni controles tapados por navegación fija, foco o teclado virtual.
- Probar carga lenta, sin foto, textos largos, catálogo apagado, resultados vacíos, error/reintento, carpeta revocada, cambio de cuenta y crédito congelado.
- Registrar capturas sintéticas antes/después y tamaño comprimido del build. Presupuesto propuesto: incremento máximo de 20 KiB gzip de JavaScript de entrada frente a la base registrada, sin dependencias nuevas.
- No copiar recursos externos ni publicar datos reales para QA. No afirmar validación de pagos externos.
- El implementador puede resolver detalles internos y CSS dentro de estas reglas; cambios de alcance, contratos o significado comercial vuelven al diseño.

La ejecución visual empieza después de revisar el plan y confirmar su dirección. El pedido posterior API primero autoriza su alcance backend parcial, sin cambiar las pausas de las demás etapas.
