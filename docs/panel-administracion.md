# Panel de administración

El espacio habitual del Administrador está en `/gestion`. Ingresar con una cuenta administrativa existente desde `/ingresar` lleva al panel. El servidor exige que la cuenta esté activa, tenga rol Administrador y conserve los permisos administrativos requeridos. El registro público crea solamente cuentas de Cliente.

## Inicio y gestión

Inicio muestra el estado actual de la red, las bandejas de trabajo, la configuración vigente y la actividad reciente. Cada tarjeta abre los registros con su filtro correspondiente. **Actualizar** consulta otra vez al servidor. Esta información es operativa; las analíticas se incorporarán en otra etapa.

El menú permite consultar usuarios, prestadores, beneficios, colaboradores, consumos, billeteras, ajustes, productos, pedidos, cancelaciones, reglas de créditos, movimientos de stock, operaciones de pago y actividad. Las listas admiten búsqueda, filtros disponibles por recurso y paginación. La ficha permite editar los campos habilitados y ejecutar las acciones compatibles con su estado actual.

Los selectores de relaciones permiten buscar por nombre o email. Seleccionar un beneficio para un colaborador agrega únicamente esa oferta concreta a su carpeta. Asignar un usuario Prestador requiere respetar su único negocio; la reasignación debe ser explícita.

Los QR se consultan y descargan desde la ficha correspondiente. Renovarlos invalida las referencias anteriores. El PIN se ingresa en su formulario protegido; nunca se muestra su valor guardado. No compartir capturas de QR, PIN ni datos de cuentas reales.

## Configuración del sitio

Cada pestaña se guarda de manera independiente:

- **General:** nombre, título y descripción de portada, texto del pie y contactos públicos. El logo gráfico conserva la identidad actual.
- **Catálogo y red:** visibilidad del catálogo público y presentación de la red, con vista previa local. Cerrar el catálogo no revoca las carpetas privadas ni los consumos elegibles.
- **Créditos:** recompensa base y meta de visitas. Las excepciones se administran en **Reglas de créditos**. Los valores históricos de consumos se conservan.
- **Tienda y retiro:** nombre, dirección, horarios y habilitación del punto de retiro para pedidos nuevos. Los pedidos anteriores conservan su información. El proveedor de pagos se consulta y no se cambia desde este panel.

## Guardados, acciones y conflictos

Un formulario con cambios avisa antes de navegar o cerrar la página. Si otra persona actualiza el registro, el servidor rechaza el guardado desactualizado y el formulario conserva el texto para compararlo. Cargar la versión actual descarta los cambios locales después del aviso correspondiente.

Las acciones sensibles piden confirmación y, cuando corresponde, un motivo. El stock se modifica mediante una variación positiva o negativa, conservando el historial. Los movimientos financieros y los datos históricos no se editan libremente.

Si una acción queda sin respuesta confirmada, **Reintentar operación anterior** conserva los datos y la identidad de ese intento para evitar efectos duplicados. Antes de iniciar una operación nueva, consultar la ficha actual. Las invitaciones distinguen envío confirmado, pendiente y fallido; un reintento del mismo envío no significa enviar otro correo.

Un rechazo de autenticación o permisos cierra el panel privado. **Mi cuenta** permite consultar los datos de sesión y cerrarla. **Administración avanzada** abre Django Admin, que tiene su propia sesión y se conserva para operaciones técnicas.

## Alcance y evidencia

Las analíticas, la experiencia de compra del Cliente y el despliegue productivo quedan fuera de esta etapa. Mercado Pago todavía requiere validación de sandbox externo. Ver el [checklist de entrega](verification/09-panel-admin-checklist.md) y la [evidencia de verificación](verification/09-panel-admin.md), que distinguen comprobaciones realizadas y limitaciones de QA.
