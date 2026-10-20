# Arquitectura y límites

Backend modular con datos y autorización centralizados; frontend consume contratos de API. Módulos previstos: cuentas, referencias, prestadores/beneficios, fidelización, tienda, métricas. Crearlos cuando exista comportamiento real.

## Acceso por QR

El QR de colaborador contiene una capacidad firmada con identificador aleatorio y versión. El servidor comprueba firma, usuario colaborador activo, habilitación administrativa y versión. Un turista autenticado redime el QR y obtiene acceso a esa versión de carpeta. Cada consulta posterior vuelve a comprobar ese acceso. No hay buscador ni listado público de carpetas o prestadores referidos.

El administrador controla miembros de carpeta y habilitación. Rotación del QR y deshabilitación invalidan accesos anteriores. Una relación de turista con una carpeta nunca otorga pertenencia de prestador o permisos administrativos. Las referencias no son autenticación de consumo; este usa otro QR de prestador y un PIN privado.

El catálogo general público es una superficie separada: lista únicamente beneficios publicados y vigentes de prestadores publicados, con DTO explícito sin relaciones de carpeta. Un interruptor singleton de Admin cierra listado, detalle y medios públicos por URL directa. Las vistas privadas por QR conservan su propia autorización y no consultan ese interruptor.

## Autoridad y consistencia

El backend calcula importes, créditos, progreso y permisos. Créditos y stock usan transacciones PostgreSQL y bloqueos de fila. Referencias históricas no se eliminan por bajas lógicas. API y logs no exponen PIN, tokens o contraseñas. Recursos subidos requieren validación.

## Extensiones

JWT con sesión revocable y refresh seguro, contrato OpenAPI y pruebas de aislamiento. Adaptador de pagos separa el simulador local de Mercado Pago. Datos históricos y demo son fuentes de referencia, no acuerdos comerciales confirmados.
