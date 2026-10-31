# Ajustes de la experiencia del Cliente

Estado: diseño aprobado explícitamente por el usuario el 30/10/2026; tareas A/B implementadas, correcciones de la revisión integral verificadas y aprobadas. La aprobación final del cliente sigue pendiente. Alcance y límites de QA en [la evidencia](../../verification/13-ajustes-vista-cliente.md).

## Presentación y permisos

El Cliente explora y utiliza beneficios desde la web, con o sin recomendaciones recibidas por QR. Solo los colaboradores gestionan recomendaciones. La experiencia del Cliente no habla de prestadores, colaboradores, carpetas, referencias técnicas ni servidores: usa negocios, beneficios, visitas y recomendaciones recibidas. Los identificadores y las autorizaciones existentes del servidor se conservan.

Recomendaciones sigue en una pantalla propia. El enlace aparece al tener una selección autorizada disponible. No se presenta una carpeta como propiedad del Cliente ni se ofrecen acciones de recomendar o gestionar selecciones. La entrada web sin QR permite explorar el catálogo y registrar visitas directas.

## Inicio y navegación

Orden del inicio: Hero → Red → En tu recorrido → Próxima parada → Mapa → Pasaporte.

El hero muestra un carrusel de beneficios vigentes con controles accesibles anterior/siguiente y pausa de cualquier avance automático con foco, interacción, pestaña oculta o movimiento reducido. Retirar el beneficio al desactivar o recargar el catálogo. Próxima parada reúne las categorías para explorar beneficios; el mapa conserva su alcance geográfico actual.

La barra inferior aparece solo en móvil. Corrección posterior del usuario: en escritorio se conserva el navbar público con Beneficios, Tienda y Cómo funciona visibles y se suman los accesos de la cuenta (Recomendaciones cuando hay beneficios recibidos disponibles, Mi viaje y Cuenta). No hay desplegable Menú en escritorio; el menú móvil se conserva. La red muestra nodos en escritorio y una lista en móvil, según el ancho disponible y sin selector manual. Se conservan selección, paginación, detalle y limpieza de contenido privado.

En tu recorrido explica explorar, visitar y sumar sellos/créditos. El QR de recomendaciones es opcional; no se presenta como requisito para utilizar beneficios.

## Pasaporte

El usuario eligió una libreta abierta con sellos visibles. Cada visita tiene un sello compacto con las iniciales del nombre actual del negocio; no se solicitan logos ni datos adicionales al catálogo. Conservar fecha, estado, distinción de anulaciones, historial, billetera y barra de visitas con datos del servidor. El diseño de libreta se adapta al móvil y respeta el movimiento reducido.

## Comprobación y entrega

Pruebas centradas en orden de secciones, carrusel, navegación según recomendaciones disponibles, presentación adaptable de la red, sellos y regresiones de sesión/privacidad. Ejecutar lint, tipos, build y suite frontend. Documentar antes/después y límites de QA real. Commits en la misma rama y actualización de PR #16; sin merge hasta aprobación del cliente.
