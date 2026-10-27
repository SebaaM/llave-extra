# Panel administrativo React y configuración del sitio

Fecha: 24/10/2026. Estado: aprobado por el usuario mediante pedido explícito de implementar y orquestar subagentes/revisores; implementación en curso.

## Pedido y decisiones

El usuario solicita un dashboard administrativo completo e interactivo, con información relevante y configuración del sitio. Las analíticas se incorporarán en otra etapa. Eligió expresamente «Panel React completo integrado al sitio» frente a renovar Django Admin.

Fuentes: `AGENTS.md`, `CONTEXT.md`, `docs/resumen-conversacion-agentes.md`, `docs/plans/00-roadmap.md`, planes 07/08, dominio E4 y E5. Este pedido autoriza diseñar una nueva etapa administrativa; no inicia las analíticas E6 ni el frontend de compras del Cliente.

La propuesta del agente es un centro de trabajo para resolver pendientes y administrar el programa. Los contadores describen registros actuales y enlazan a listados; no son informes de rendimiento.

## Alternativas consideradas

1. **React integrado, elegido por el usuario.** Permite navegación consistente con los espacios existentes, formularios específicos y una configuración centralizada. Requiere endpoints administrativos nuevos y pruebas de autorización.
2. **Personalizar Django Admin.** Reutiliza formularios actuales y reduce desarrollo, pero limita la experiencia integrada solicitada.

Se conserva `/admin/` como herramienta administrativa existente, con su sesión y CSRF independientes. La gestión habitual de esta etapa estará disponible en React sin obligar a abrir Django Admin para completar las operaciones incluidas.

## Experiencia y navegación

Ruta propuesta por el agente: `/gestion`, con subrutas. El enlace «Administrar», el destino tras ingreso ADMIN y `/espacio` dirigirán al nuevo panel. El acceso técnico a `/admin/` será explícito y secundario.

Barra lateral persistente en escritorio y menú accesible en móvil. Identidad Llave Extra, colores y tipografías existentes, encabezado con sección y cuenta, enlace al sitio y cierre de sesión. Navegación por teclado, foco visible, títulos y etiquetas en español; `TOURIST` se presenta como Cliente.

Secciones: Inicio; Usuarios; Prestadores; Beneficios; Colaboradores y carpetas; Consumos y créditos; Productos; Pedidos y cancelaciones; Actividad administrativa; Configuración; Mi cuenta.

Las tablas incorporan búsqueda, filtros apropiados, orden estable y paginación del servidor. Los filtros/página se conservan en la URL. Los detalles y formularios usan rutas propias para permitir volver, recargar y compartir enlaces internos. En móvil se adapta la presentación sin ocultar acciones necesarias.

Se contemplan carga, vacío real, error con reintento, validación por campo, éxito y conflicto por registro actualizado. Los formularios avisan antes de abandonar cambios. Las acciones sensibles muestran destinatario, efecto y confirmación; las financieras exigen motivo. Un error nunca se representa como cero o lista vacía.

## Inicio operativo

- Tarjetas de registros: usuarios activos, prestadores publicados, beneficios vigentes, colaboradores habilitados. Cada tarjeta abre el listado filtrado.
- Bandeja priorizada: negocios/beneficios en borrador; pedidos pagados por preparar y preparados por entregar; solicitudes de cancelación abiertas; pagos en revisión/reintegros pendientes; ajustes de créditos sin resolver; productos activos sin stock.
- Estado de configuración: catálogo abierto/cerrado, retiro configurado/habilitado, recompensa/meta actuales y modo de pagos como información de solo lectura.
- Actividad administrativa reciente, sin claves privadas ni payloads de pagos.
- Botón Actualizar y fecha de última consulta exitosa. No se exige polling ni actualizaciones en tiempo real en esta etapa.

Los borradores representan contenido por revisar según el modelo actual; no se inventa un nuevo flujo de aprobación. No se incluyen gráficos, tendencias, comparaciones temporales, embudos, rankings, atribución ni exportaciones analíticas.

## Gestión operativa incluida

| Área | Consulta y acciones |
| --- | --- |
| Usuarios | Buscar por email/nombre, filtrar por rol/actividad/verificación, ver ficha, editar nombre/apellido, activar/desactivar y crear cuentas de los roles Cliente, Prestador y Colaborador. El registro público mantiene solo Cliente. |
| Prestadores | Alta y edición de datos, contacto, imagen y estado; asignación o retiro de usuarios Prestador mediante una operación explícita. Un usuario maneja como máximo un negocio; un negocio admite varios usuarios. |
| Beneficios | Alta y edición de propuesta, condiciones, fechas, imagen y estado; filtros por negocio y publicación. Validar fechas, permisos y medios en servidor. |
| Colaboradores | Crear perfil para un usuario Colaborador, editar presentación de su red, habilitar/deshabilitar y rotar/consultar/descargar QR. Mostrar y administrar las selecciones concretas `FolderBenefit` con agregar/quitar. |
| Credenciales de consumo | Consultar/descargar QR del Prestador, configurar PIN nuevo y rotar QR con confirmación. El PIN anterior y su hash nunca se devuelven. |
| Consumos y créditos | Buscar consumos, ver detalle y regla histórica, anular con motivo; consultar billeteras y movimientos; resolver ajustes con motivo y resolución válidos. No editar saldos, movimientos ni consumos históricos directamente. |
| Productos | Alta/edición de nombre, descripción, imagen, precios y actividad. Ajustar inventario mediante delta con motivo; mostrar saldo resultante e historial. |
| Pedidos | Listado/ficha con líneas y retiro históricos, modalidad, estado, auditoría y cancelaciones. Preparar, entregar, aprobar/rechazar cancelación, solicitar reintegro y reintentar una operación recuperable cuando lo permita E5. |
| Actividad | Consultar auditoría nueva de operaciones del panel y auditorías de pedidos existentes, con filtros por actor, recurso y acción. Datos de seguridad/payloads remotos quedan excluidos. |

Decisiones de alcance propuestas por el agente: el panel no permite crear otros administradores, asignar `is_staff`/`is_superuser`, manipular grupos/permisos, marcar email verificado, establecer contraseñas de terceros ni convertir roles de usuarios existentes. Las cuentas nuevas usan el mecanismo de restablecimiento por email para elegir contraseña, sin devolver ni registrar enlaces/token en la respuesta administrativa; el plan verificará su compatibilidad y ofrecerá una acción de reenvío limitada y auditada. El envío SMTP sigue siendo el existente, sin crear un worker de correo.

La reasignación de negocio es una acción específica validada, no la edición de una asociación histórica. No hay borrados masivos ni eliminación de registros con historia en esta etapa; retirar una selección concreta y desasignar una membresía sí están incluidos. La desactivación de una cuenta revoca sus sesiones e impide operaciones nuevas, conservando la historia. La cuenta administrativa actual no puede desactivarse desde el panel.

## Configuración del sitio

Una sección con pestañas y guardado independiente por grupo. Mostrar valores actuales, ayuda, validación y confirmación de guardado. No usar un JSON genérico editable ni un editor de HTML.

### General y contenido público — nueva configuración

Campos propuestos por el agente: nombre visible del sitio, título y descripción de portada, texto explicativo del pie, email de contacto y enlaces opcionales de WhatsApp e Instagram. Los valores iniciales de textos reproducen el sitio actual; los contactos arrancan vacíos y no se inventan datos reales.

Estos cambios se reflejan efectivamente en portada, marca textual/metadatos apropiados y pie público, con DTO público limitado a campos de presentación. Se mantiene el logo gráfico existente y la identidad visual; no se agrega un editor de temas arbitrarios ni CMS. Texto plano con límites; enlaces validados a esquemas seguros y dominios correspondientes, sin HTML, JavaScript ni enlaces privados. Campos vacíos opcionales no generan enlaces.

### Catálogo y red — configuración existente

Habilitación del catálogo público; título, distribución, tema, fondo, cantidad de prestadores por página e intervalo de la red. Reutiliza `CatalogConfig` y sus rangos/opciones vigentes. Incluir una vista previa local de la presentación antes de guardar; guardar aplica a la red pública. Las configuraciones propias de colaboradores se editan en su ficha.

Cerrar el catálogo cambia la visibilidad pública según los contratos actuales; no cierra carpetas privadas ni impide consumos válidos.

### Créditos y progreso — configuración existente

Recompensa base, meta de visitas y reglas por Prestador. Los cambios afectan operaciones futuras y conservan snapshots/reglas de consumos anteriores. Mostrar este efecto junto al formulario. Reutiliza `CreditPolicy` y `ProviderCreditRule`, con validación y locks actuales.

### Tienda y retiro — configuración existente

Punto, dirección, horarios y habilitación de retiro mediante `ShopSettings`. Para habilitarlo deben estar completos los datos necesarios. Los pedidos previos conservan `pickup_snapshot`.

El proveedor de pagos se muestra en modo de solo lectura con su estado real. `disabled` permanece predeterminado; las credenciales y la habilitación de Mercado Pago siguen fuera de esta UI. No se promete conexión remota ni scheduler desplegado.

## Arquitectura y autorización

React/TypeScript/Tailwind existente; reutilizar componentes de workspace cuando sus límites lo permitan, con módulos administrativos propios. No introducir otra aplicación frontend, servicio o framework; un módulo Django del monorepo puede organizar el nuevo dominio administrativo. DRF expone una API administrativa separada, propuesta `/api/v1/admin/`, con contratos OpenAPI y DTOs explícitos.

La autorización de cada endpoint, acción, descarga y medio requiere usuario activo, rol `ADMIN`, `is_staff` e `is_superuser`, consistente con la administración actual. El backend es la autoridad; ningún campo enviado por el cliente cambia esos permisos. Probar individualmente anónimo, Cliente, Colaborador, Prestador y ADMIN sin privilegios suficientes. El JWT y la revocación de sesiones se reutilizan; no se transforma una sesión React en una sesión Django Admin.

El cliente cierra y limpia el contenido privado ante 401/403 o cambio de identidad, cancela peticiones pendientes e impide que respuestas viejas vuelvan a montar información. Los medios requieren autorización administrativa en cada solicitud; se reutiliza validación de imágenes y storage privado sin filtrar URLs públicas permanentes.

Consultas ORM acotadas, paginación y órdenes deterministas; sin N+1 en listados. Listados y detalle solo exponen datos necesarios: nunca contraseñas/hashes, refresh tokens, referencias QR salvo acción dedicada, secretos de proveedor, claves de idempotencia ni cuerpos remotos.

## Escrituras, conflictos y auditoría

Reutilizar servicios E4/E5 y métodos de dominio actuales para efectos financieros, habilitación, QR y selecciones. La capa HTTP no escribe estados, stock, saldos ni historia directamente. Preservar locks perfil → prestador → beneficio y User → Wallet → Order → Product; no añadir un lock común que invierta esos órdenes. HTTP de pagos permanece fuera de `atomic`.

Los cambios de formularios/configuración usarán precondición de versión del registro; guardar una versión obsoleta devuelve conflicto y permite recargar sin sobrescribir silenciosamente. El plan definirá un mecanismo consistente también para cambios realizados desde Django Admin y APIs existentes, no solo para React. Las operaciones de comando revalidan estado dentro de su transacción y aceptan claves idempotentes para que un timeout/doble clic no repita un ajuste, rotación o envío. Una misma clave con otra carga se rechaza y las respuestas no filtran secretos. No se recupera un QR antiguo después de una rotación posterior: la consulta dedicada obtiene siempre el vigente.

Una auditoría administrativa persistida registra actor, acción, recurso, fecha, motivo cuando aplica y campos modificados permitidos; no almacena contraseñas, PIN, QR firmado, tokens ni payloads remotos. Los efectos locales y su auditoría son atómicos. La auditoría financiera existente conserva su semántica y no se modifica ni se reemplaza. Toda operación rechazada conserva el estado previo y devuelve un error útil.

La compatibilidad exacta de la idempotencia nueva con los servicios existentes se resuelve en el plan antes de implementar; no se duplica ni se salta el motor de pagos.

## Límites de esta etapa

Analíticas E6, UI de compra/canje del Cliente, cobros reales, sandbox externo, despliegue y scheduler permanecen pendientes. No fusionar PRs ni reescribir historia. No cambiar ofertas, contactos, QR, cuentas o stock de la base principal durante pruebas; usar datos sintéticos/proyecto aislado y conservar los cambios documentales existentes del usuario.

## Verificación y aceptación

1. ADMIN autorizado entra desde el login al panel y puede completar cada operación incluida sin depender de formularios Django; no autorizados son rechazados en servidor, incluidos archivos y acciones con IDs ajenos.
2. Los contadores y bandejas corresponden a filtros documentados de registros reales; nunca muestran métricas inventadas. Búsqueda, filtros, paginación, detalle y navegación atrás funcionan.
3. Configurar cada grupo afecta el consumidor correspondiente; los textos/contactos públicos y la presentación de la red cambian, y los consumos/pedidos anteriores mantienen sus snapshots.
4. PostgreSQL real: concurrencia, precondiciones obsoletas, replays, cambios simultáneos desde Django/Admin/API, rollback/auditoría, restricciones e invariantes E4/E5. Probar ausencia de escalada y auto-desactivación, revocación de sesiones y validación de datos/medios.
5. Pruebas frontend de formularios, errores, cierre de sesión/permisos, respuestas tardías e idempotencia; lint, TypeScript y build. Regresiones de Cliente, Prestador y Colaborador al cambiar navegación/configuración pública.
6. QA real en escritorio y a 320 px: login, navegación, búsqueda, guardados de configuración, una operación de cada familia sensible y estados de error. Imágenes verificadas mediante flujo real si la herramienta disponible lo permite, documentando cualquier límite.
7. Ruff, migraciones sin drift, OpenAPI sin warnings, suite backend PostgreSQL/Redis y suite frontend apropiadas. Evidencia de comandos/resultados; el adaptador fake solo verifica comportamiento interno.
8. Contexto, roadmap, ToDo, AGENTS cuando corresponda y contrato API alineados con la entrega. Feature GitFlow y PR a `develop` con base/dependencias comprobadas; revisión independiente de seguridad/concurrencia y CI antes del cierre, sin fusionar.

## Aspectos que puede resolver el implementador

Nombres internos, distribución exacta de componentes/archivos, endpoint por recurso, índices necesarios, tamaño de página dentro de límites razonables, mecanismo de versión y colocación de diálogos se concretan en el plan. Deben respetar las operaciones, restricciones y aceptación de este documento. La propuesta visual sigue los paneles existentes, con mayor densidad de información; no requiere nuevas librerías ni imágenes generadas.
