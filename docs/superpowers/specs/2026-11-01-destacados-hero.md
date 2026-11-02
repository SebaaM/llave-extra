# Beneficios destacados del inicio

Pedido del usuario del 1/11/2026: el carrusel del hero muestra los beneficios destacados por el administrador, configurables en el backoffice. Se incorpora al trabajo autorizado de feature/cliente-qr-destacados y su nueva PR hacia develop, sin merge; PR #16 ya fue integrada el 31/10.

La ficha de cada beneficio en `/gestion/beneficios` incorpora una casilla «Destacado en el inicio». Solo el Administrador activo con staff/superusuario puede modificarla. Se reutiliza el PATCH de ficha con precondición de versión y auditoría existentes; un reenvío con versión antigua devuelve 409 sin repetir el efecto. Las acciones con comandos conservan su idempotencia, sin convertir la edición de ficha en un comando nuevo; el Prestador no puede modificar este atributo. También se presenta en Django Admin con etiquetas en español.

Decisión de implementación: un booleano `featured`, falso por defecto y sin selección automática al migrar, mantiene la configuración simple. No se agrega orden manual ni máximo arbitrario. El orden público estable existente se conserva. El catálogo completo sigue incluyendo los demás beneficios; destacar no publica un borrador ni habilita medios privados.

El hero consulta el catálogo con filtro `featured=true`, aplicado en servidor antes de paginar y sobre la política pública vigente (negocio/beneficio publicados, vigencia e interruptor del catálogo). Los controles del carrusel recorren todos los resultados destacados mediante páginas de la API, sin quedarse en los primeros 24. Texto y medios usan únicamente DTO/rutas públicas; no recomendaciones de colaboradores.

Si no hay destacados elegibles se muestra un mensaje breve, sin fallback a ofertas no destacadas. Al cambiar configuración, despublicar, vencer o retirar la marca, la siguiente consulta deja de mostrar el beneficio. La UI limpia contenido durante recarga/denegación y conserva los controles manuales accesibles, sin avance automático.

Pruebas: permisos Admin/Prestador, actualización con versión/auditoría y rechazo 409 de precondición antigua, migración sin selección automática, filtrado publicado/vigente/interruptor, orden y paginación; hero sin ofertas comunes, cero/uno/varios/más de 24 destacados, error/reintento/respuestas tardías y retiro de datos. PostgreSQL, Ruff/OpenAPI/drift, frontend lint/tipos/build y documentación antes/después.
