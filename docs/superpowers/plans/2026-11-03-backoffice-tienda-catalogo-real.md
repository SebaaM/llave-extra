# Backoffice de tienda y catálogo real

## Resumen

Mejorar la administración existente en `/gestion` para trabajar cómodamente con **productos, categorías, stock y configuración de retiro**. Conectar la tienda pública con los productos publicados desde ese panel.

La gestión actual de pedidos se conserva. Esta entrega no incorpora carrito, compra, canje ni cambios en la integración de pagos.

## Gestión y experiencia de uso

- **Tabla de productos con 20 filas por página:** miniatura y nombre, categoría, publicación, stock, precio en pesos, precio en créditos y acciones.
- Ordenamiento ascendente/descendente desde los encabezados de datos, aplicado en servidor antes de paginar. Orden inicial: nombre A–Z, con identificador como desempate.
- Búsqueda por nombre y descripción; filtros por categoría, publicación, disponibilidad —con stock, stock bajo, agotado— y modalidad de precio —pesos, créditos o ambas—. Botón para limpiar filtros.
- Conservar búsqueda, filtros, orden y página en la URL y al regresar de una ficha. Mostrar total y rango, por ejemplo: «21–40 de 87 productos». Al cambiar filtros u orden, volver a la primera página.
- **Alta y edición:** nombre, descripción, categoría, imagen, precios y publicación, agrupados en secciones claras. Vista previa de la imagen, opción de reemplazarla o quitarla, errores junto al campo y aviso ante cambios sin guardar.
- Crear productos como borrador y con stock cero. Después de guardar, ofrecer acceso directo a cargar existencias. Exigir al menos un precio válido y permitir productos disponibles únicamente en una modalidad.
- **Stock:** registrar entrada o salida, cantidad positiva y motivo obligatorio; mostrar existencias actuales y resultado previsto antes de confirmar. Actualizar ficha y tabla después de la operación y ofrecer historial de movimientos del producto.
- **Categorías:** crear, renombrar, activar y desactivar. Confirmar la desactivación mostrando cuántos productos publicados afecta. Mostrar en administración cuándo un producto queda oculto por su categoría.
- **Configuración:** punto, dirección, horarios y habilitación del retiro; agregar umbral de stock bajo, inicialmente **5 unidades**, editable por Administrador.

La interfaz conservará la identidad visual actual: fondos neutros, verde para publicación, ámbar para stock bajo y rojo para errores. Todos los estados tendrán texto. La tabla tendrá encabezado fijo, foco visible y desplazamiento horizontal dentro de su contenedor en pantallas pequeñas.

## API, datos y tienda pública

- Reutilizar los endpoints administrativos de productos, ajustes de stock y configuración. Incorporar ordenamiento y filtros mediante parámetros validados y listas de campos permitidos, manteniendo los parámetros existentes.
- Agregar categorías administrables y su relación opcional con productos. Los nombres serán únicos ignorando mayúsculas y espacios exteriores; se desactivarán en lugar de borrarse.
- Migración compatible: productos actuales **sin categoría**, sin modificar precios, publicación, stock ni pedidos; umbral inicial de stock bajo igual a 5.
- Mantener autorización administrativa en servidor, control de versiones al editar y ajustes de stock transaccionales con motivo, auditoría e idempotencia. El stock no se sobrescribe desde el formulario de edición.
- Usar una política común para listado, detalle e imágenes públicas: producto activo y categoría activa, o producto activo sin categoría. **Desactivar una categoría ocultará sus productos; reactivarla recuperará la visibilidad de los que sigan activos.**
- Conectar `/tienda` y sus fichas con la API real. Incorporar búsqueda, categorías y ordenamiento en servidor, conservando seis tarjetas por página.
- Obtener las categorías públicas completas desde metadatos del catálogo, sin deducirlas de una página parcial. Exponer únicamente los datos públicos de retiro habilitado; mantener privada la configuración operativa.
- Mostrar los precios disponibles correctamente y los productos agotados con «Sin stock». Usar una imagen neutra cuando falte fotografía.
- Sustituir los productos y textos ficticios por estados reales de carga, error, vacío y producto no disponible. Las fichas usarán el identificador existente del backend; los enlaces antiguos de ejemplos mostrarán una salida clara hacia el catálogo.
- Mantener visible que la compra y el canje todavía no están habilitados. La imagen decorativa del hero podrá conservarse sin presentarla como un producto publicado.

## Verificación y entrega

1. **Backend:** probar permisos, categorías duplicadas, migración conservando datos, filtros y orden antes de paginar, precios opcionales y ocultación de listado/detalle/imágenes al desactivar una categoría.
2. **Stock y concurrencia:** comprobar entradas, salidas, rechazo de resultados negativos, versiones desactualizadas y reintentos sin duplicar movimientos.
3. **Frontend:** verificar ordenamiento, filtros combinados, navegación entre páginas, regreso desde edición, formularios, imágenes, estados de error y recuperación cuando desaparece la última página.
4. **Catálogo real:** comprobar publicación y despublicación desde el panel, categorías completas con más de una página, productos agotados y ausencia de solicitudes de compra o canje.
5. Ejecutar pruebas backend con PostgreSQL, lint, tipos, build, validación OpenAPI y revisión visual en escritorio y móvil. Documentar comandos, resultados y resumen antes/después.

Implementar en una **rama nueva desde `develop`**, separada de los cambios anteriores, con commits en español y PR en borrador hacia `develop`. Mantener pendientes visibles y esperar aprobación antes de fusionar.

## Supuestos y límites acordados

- Una imagen principal por producto; categorías opcionales para conservar los productos existentes.
- Desactivar una categoría conserva productos, existencias e historial.
- El aviso de stock bajo se aplica cuando las existencias están entre 1 y el umbral configurado; cero se muestra como agotado.
- Los pedidos existentes conservan sus importes y datos de retiro registrados.
- Importación masiva, variantes de producto y mejoras de pedidos quedan para otra entrega.
