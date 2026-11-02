# Selección contextual por QR

Estado: flujo precisado por el usuario: login antes de mostrar selección, vínculo registrado para seguimiento, consumo atribuido y confirmación con QR del negocio + PIN. QR estable y renovación manual desde el espacio del colaborador. Implementación en curso; la ubicación del resumen en su ficha administrativa es una decisión de implementación acotada.

## Experiencia del Cliente

El catálogo sigue siendo la vista habitual y no existe una sección permanente Recomendaciones en el navbar, barra inferior o cuenta. Si el turista abre el QR de un colaborador, inicia sesión y luego ve una sección contextual titulada «Recomendaciones de [nombre]», con los negocios y beneficios concretos elegidos por ese colaborador.

La selección no se copia a la cuenta ni es administrable por el turista. Se consulta vigente en el servidor y el contexto del QR activo vive en memoria, con una pista mínima por pestaña (identificador de cuenta y colaborador, sin nombre, QR, URL ni secretos) para sobrevivir la apertura del QR del negocio. Al cambiar de cuenta/cerrar sesión se limpia; un QR nuevo sustituye el contexto anterior. La ruta `/referencia` conserva la entrada y el contexto QR; `/beneficios` sigue siendo el catálogo normal. No hay colección de recomendaciones guardadas ni selector de accesos históricos en la cuenta.

El nombre de presentación usa nombre/apellido configurados del colaborador, con una alternativa neutra cuando no están completos. Nunca se usa su correo como nombre público ni se exponen datos de su cuenta. Las tarjetas hablan de negocios y beneficios, sin jerga de roles del proyecto.

## QR estable y renovación manual

El QR/URL identifica al colaborador y abre su selección vigente; no contiene una copia de los beneficios. Editar la selección no obliga a cambiar el QR. Consultar, copiar, descargar o recargar la pantalla no cambia el enlace ni rota su autorización. El colaborador puede renovarlo mediante una acción manual explícita desde su espacio, invalidando el QR anterior. No se implementan temporizadores de renovación.

Situación anterior: la rotación real solo estaba expuesta en administración; «Actualizar QR» consultaba sin rotar y la firma incluía la hora. La implementación nueva entrega enlace estable por versión y renovación propia manual, conserva códigos anteriores hasta renovar y no persiste QR/URL/PIN en resultados. Ver el plan y la evidencia del corte vigente.

## Vínculo y consumo

Tras iniciar sesión se registra que el turista ingresó por ese QR. Se reutiliza el acceso existente `FolderAccess` como vínculo/autorización, no como copia de la selección. Validar QR, versión vigente, colaborador habilitado y `FolderBenefit` en cada lectura/medio; sin transformar el catálogo en una lista privada ni habilitar acceso anónimo.

La visita puede atribuirse al colaborador desde el contexto activo del QR. Mantener reglas E4, transacciones, referencias válidas, QR/PIN del negocio y reintentos idempotentes. Una referencia inválida no se convierte automáticamente en consumo directo. No se necesitan nuevos secretos ni identificadores persistidos en el navegador.

El usuario confirmó conservar QR del negocio + PIN. No se habilita consumo con PIN solo ni se modifican los contratos o reglas E4 por este ajuste.

Antes de enviar el primer consumo, el Cliente puede elegir explícitamente continuar sin la recomendación activa y limpiar ese contexto si descubrió otro negocio por su cuenta. No es una conversión automática después de rechazar una referencia; un consumo incierto conserva su cuerpo y clave originales. Para volver a atribuir desde la selección abandonada debe abrir su QR otra vez.

## Resumen administrativo propuesto

En la ficha del colaborador del panel Administrador, mostrar «Clientes que ingresaron por QR» (turistas distintos con vínculo registrado) y «Visitas válidas atribuidas». Son conteos históricos, no accesos nuevos ni un total de escaneos. No agregan analítica general E6 ni datos personales de turistas a pantallas públicas.

## Verificación y entrega

Pruebas PostgreSQL de autenticación, vínculo único, nombre seguro, selección canónica vigente, revocación/rotación, medios y resumen; regresiones de consumo referido y directo. Frontend: catálogo sin acceso permanente, QR/login con contexto dinámico y cambio de cuenta/QR/respuestas tardías. Lint, tipos, build, esquema API y documentación antes/después. Nueva entrega en feature/cliente-qr-destacados y otra PR hacia develop, sin merge hasta aprobación del cliente; PR #16 fue integrada externamente el 31/10.
