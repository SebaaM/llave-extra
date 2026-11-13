# Panel de administración

El espacio habitual del Administrador está en `/gestion`. Ingresar con una cuenta administrativa existente desde `/ingresar` lleva al panel. El servidor exige que la cuenta esté activa, tenga rol Administrador y conserve los permisos administrativos requeridos. El registro público crea solamente cuentas de Cliente.

## Inicio y gestión

Inicio muestra el estado actual de la red, las bandejas de trabajo, la configuración vigente y la actividad reciente. Cada tarjeta abre los registros con su filtro correspondiente. **Actualizar** consulta otra vez al servidor. Esta información es operativa; las analíticas se incorporarán en otra etapa.

**Inicio, Pedidos, Productos y Beneficios** tienen acceso directo. El resto del menú se organiza en cuatro grupos desplegables:

- **Red y usuarios** reúne usuarios, prestadores y colaboradores.
- **Tienda** reúne categorías de tienda, movimientos de stock, cancelaciones y operaciones de pago.
- **Créditos y visitas** reúne consumos, billeteras, ajustes y reglas de créditos.
- **Administración** reúne actividad y configuración.

El menú abre automáticamente el grupo de la sección actual al entrar a una lista o ficha. **Mi cuenta** queda en la cabecera, junto a **Salir**. Las listas admiten búsqueda, filtros disponibles por recurso y paginación. La ficha permite editar los campos habilitados y ejecutar las acciones compatibles con su estado actual.

Los selectores de relaciones permiten buscar por nombre o email. Seleccionar un beneficio para un colaborador agrega únicamente esa oferta concreta a su carpeta. Asignar un usuario Prestador requiere respetar su único negocio; la reasignación debe ser explícita.

Los QR se consultan y descargan desde la ficha correspondiente. Renovarlos invalida las referencias anteriores. El PIN se ingresa en su formulario protegido; nunca se muestra su valor guardado. No compartir capturas de QR, PIN ni datos de cuentas reales.

## Beneficios destacados

Entrá en **Beneficios destacados** para buscar por beneficio o prestador y ver todos los registros, incluidos borradores e inactivos. La selección actual y el contador aparecen encima del listado. Usá **Destacar** para sumar un beneficio y **Quitar** para liberar uno de los cinco cupos. Cada acción se guarda en el momento.

Un beneficio seleccionado ocupa un cupo aunque todavía no aparezca en el inicio. El carrusel muestra solo los beneficios publicados y vigentes de prestadores publicados cuando el catálogo público está habilitado.

## Configuración del sitio

Cada pestaña se guarda de manera independiente:

- **General:** nombre, título y descripción de portada, texto del pie y contactos públicos. El logo gráfico conserva la identidad actual.
- **Catálogo y red:** visibilidad del catálogo público y presentación de la red, con vista previa local. Cerrar el catálogo no revoca las carpetas privadas ni los consumos elegibles.
- **Créditos:** recompensa base y meta de visitas. Las excepciones se administran en **Reglas de créditos**. Los valores históricos de consumos se conservan.
- **Tienda y retiro:** nombre, dirección, horarios y habilitación del punto de retiro para pedidos nuevos. Los pedidos anteriores conservan su información. El proveedor de pagos se consulta y no se cambia desde este panel.

## Comisiones por consumos referidos

En **Comisiones** (`/gestion/comisiones`) el estado, la fecha de verificación por QR y PIN y el paso pendiente aparecen con el acordeón cerrado. Los filtros por estado, Prestador y Colaborador se aplican antes de paginar. Abrí una fila para ver la declaración, el monto aproximado, la base aprobada, el porcentaje y la fecha y el responsable de cada paso.

1. El Cliente confirma el beneficio con el QR y el PIN del negocio. El referido queda **Falta verificación del Prestador**.
2. En **Consumos referidos**, el Prestador declara el resultado y el monto. Cuando declara un importe positivo, la ficha pasa a **A pagar comisión**.
3. El Administrador confirma la base y aprueba. El Prestador transfiere directamente al Colaborador por fuera de Llave Extra e informa el pago. El Administrador coteja el comprobante, confirma la recepción y marca **Completado**.
4. En los casos sin comisión, el Administrador puede pedir corrección o registrar el cierre. Si surge una discrepancia tras informar un pago, queda una incidencia en la ficha.

En **Reglas de comisión**, el Administrador configura el porcentaje global. El Prestador elige en **Mis beneficios** si cada beneficio usa esa tasa o una opción de 3 %, 7 % o 10 %. El respaldo global es 5 %. La tasa se guarda al validar el consumo con QR y PIN. Las excepciones por Prestador permanecen disponibles para los casos anteriores sin tasa registrada. Los datos bancarios se consultan por una acción explícita y auditada cuando el estado lo permite. Los referidos históricos sin beneficio siguen visibles como «Beneficio no registrado».

## Guardados, acciones y conflictos

Un formulario con cambios avisa antes de navegar o cerrar la página. Si otra persona actualiza el registro, el servidor rechaza el guardado desactualizado y el formulario conserva el texto para compararlo. Cargar la versión actual descarta los cambios locales después del aviso correspondiente.

Las acciones sensibles piden confirmación y, cuando corresponde, un motivo. El stock se modifica mediante una variación positiva o negativa, conservando el historial. Los movimientos financieros y los datos históricos no se editan libremente.

Si una acción queda sin respuesta confirmada, **Reintentar operación anterior** conserva los datos y la identidad de ese intento para evitar efectos duplicados. Antes de iniciar una operación nueva, consultar la ficha actual. Las invitaciones distinguen envío confirmado, pendiente y fallido; un reintento del mismo envío no significa enviar otro correo.

Un rechazo de autenticación o permisos cierra el panel privado. **Mi cuenta** permite consultar los datos de sesión y cerrarla. **Administración avanzada** abre Django Admin, que tiene su propia sesión y se conserva para operaciones técnicas.

## Alcance y evidencia

Las analíticas, la experiencia de compra del Cliente y el despliegue productivo quedan fuera de esta etapa. Mercado Pago todavía requiere validación de sandbox externo. Ver el [checklist de entrega](verification/09-panel-admin-checklist.md) y la [evidencia de verificación](verification/09-panel-admin.md), que distinguen comprobaciones realizadas y limitaciones de QA.
