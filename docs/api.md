# Contrato de API E3–E5, catálogo público y administración

Catálogo visual frontend (26/10/2026): `/tienda` y `/tienda/:slug` muestran ejemplos estáticos identificados, sin consumir endpoints `shop`, crear pedidos ni modificar stock/créditos. No introduce rutas o cambios en OpenAPI. El contrato transaccional E5 sigue disponible para una futura integración, fuera del alcance de esta vista previa.

Fuente ejecutable: `backend/config/urls.py` y los `@extend_schema` de las aplicaciones, incluidas `backend/providers/recommendations.py`, `backend/credits/views.py` y `backend/shop/views.py`. Generar y validar con `docker compose exec -T backend uv run --locked python manage.py spectacular --file /tmp/llave-extra-openapi.yaml --validate`; el esquema interactivo está en `/api/docs/` y JSON/YAML en `/api/schema/`. Cambios incompatibles requieren una nueva versión de ruta `/api/vN/`; campos nuevos opcionales no cambian versión. Cliente es el nombre de producto del rol técnico `TOURIST`; hay cuatro roles en total.

Todas las rutas de dominio usan `/api/v1/`. `GET /auth/csrf/` entrega token CSRF y cookie; enviarlo como `X-CSRFToken` en los POST de autenticación. El frontend futuro usará el proxy Vite del mismo origen. No se configura CORS con credenciales abiertas. `POST /auth/login/` devuelve `access` y deja refresh en cookie `HttpOnly` con ruta `/api/v1/auth/`; `POST /auth/refresh/` lo rota y devuelve nuevo `access`; `POST /auth/logout/` revoca sesión y borra cookie. Si la cookie falta, logout acepta un access bearer válido para revocar la sesión. Access dura 5 minutos, refresh 7 días. `GET /auth/me/` requiere `Authorization: Bearer <access>`.

| Ruta | Entrada | Resultado |
| --- | --- | --- |
| `POST /auth/register/` | `email`, `password`, `referral_token` opcional | 201: cuenta Cliente (`TOURIST`), email pendiente; referencia válida se redime atómicamente; campos de privilegio rechazados |
| `POST /auth/verify-email/` | `token` | 200: email verificado; token de un uso, 24 h |
| `POST /auth/resend-verification/` | `email` | 202 genérico |
| `POST /auth/forgot-password/` | `email` | 202 genérico |
| `POST /auth/reset-password/` | `token`, `password` | 200: contraseña nueva, sesiones revocadas; token de un uso, 1 h |
| `POST /referrals/redeem/` | `token` de QR en cuerpo; bearer | 200: grant idempotente al turista autenticado |
| `GET /me/folders/` | bearer Cliente (`TOURIST`) | Solo IDs de referencias activas; prestadores por las rutas de carpeta E3 |
| `GET /collaborator/qr/` | bearer colaborador habilitado | URL firmada actual; `qr.png` descarga la imagen |

### Prestadores y carpetas (E3)

Todas estas rutas requieren autenticación. `folder_id`, `provider_id` y `benefit_id` son UUID. Para turistas, la autorización se comprueba en **cada** listado, detalle y medio mediante `active_folder_access` (rol y grant de versión QR vigente), selección concreta `FolderBenefit` y publicación/vigencia. `FolderProvider` queda como historia de solo lectura administrativa sin efecto autorizante. Un ID cruzado o revocado responde 404. Parámetros de búsqueda desconocidos no amplían la consulta. No hay roster público de carpetas.

### Catálogo general público

Las rutas siguientes son anónimas, de solo lectura y siempre responden `Cache-Control: no-store`. El interruptor `providers.CatalogConfig` se edita desde Django Admin o la API administrativa por un superusuario activo con rol `ADMIN` e `is_staff`; arranca habilitado. Al deshabilitarlo, `config/` responde `200 {"enabled": false}` y todas las demás rutas públicas del catálogo responden 404, incluso por URL directa. Esto no modifica las rutas de carpeta ni la elegibilidad de consumo.

| Ruta relativa a `/api/v1/` | Resultado |
| --- | --- |
| `GET /catalog/config/` | `{enabled: boolean}` |
| `GET /catalog/benefits/?page=1&page_size=24&search=...&category=...` | `{count, next, previous, results}`; 24 por página, máximo 48; búsqueda en título, descripción y nombre de prestador, categoría exacta sin distinguir mayúsculas |
| `GET /catalog/benefits/{benefit_id}/` | DTO público de un beneficio vigente |
| `GET /catalog/benefits/{benefit_id}/media/` | Imagen del beneficio, revalidando interruptor, publicación y vigencia |
| `GET /catalog/providers/{provider_id}/media/` | Imagen del prestador cuando tiene al menos un beneficio público vigente; revalida la misma política |

El beneficio expone solo `id`, `title`, `description`, `conditions`, `valid_from`, `valid_until`, `demo`, `image_url` y `provider`. El prestador anidado expone solo `id`, `slug`, `name`, `category`, `description`, `address`, `hours`, `contact`, `map_url`, `website`, `demo` e `image_url`. `demo=true` marca muestras sin acuerdo comercial confirmado. Solo aparecen beneficios `PUBLISHED` de prestadores `PUBLISHED` con `valid_from <= fecha local <= valid_until` cuando cada límite existe; los límites son inclusivos. No se entregan relaciones con carpetas, QR, PIN, membresías ni procedencia. Los archivos permanecen en almacenamiento privado y los `image_url` apuntan a vistas que aplican la política en cada solicitud.

| Ruta relativa a `/api/v1/` | Rol | Resultado |
| --- | --- | --- |
| `GET /folders/{folder_id}/providers/` | turista con grant activo | Prestadores únicos con alguna selección vigente de esa carpeta |
| `GET /folders/{folder_id}/providers/{provider_id}/` | idem | Ficha del prestador |
| `GET /folders/{folder_id}/providers/{provider_id}/benefits/` | idem | Solo beneficios concretos seleccionados, publicados y vigentes |
| `GET /folders/{folder_id}/providers/{provider_id}/benefits/{benefit_id}/` | idem | Beneficio autorizado |
| `GET .../media/` en ficha o beneficio | idem | Imagen privada, si existe |
| `GET /provider/providers/` y `GET /provider/providers/{provider_id}/` | prestador con membresía | Negocio propio, incluso borrador; la lista conserva un array de cero o uno |
| `PATCH /provider/providers/{provider_id}/` | prestador titular | Solo descripción, domicilio, horarios, contacto, mapa, web e imagen |
| `GET /provider/providers/{provider_id}/benefits/` | prestador titular | Ofertas propias, incluyendo borradores |
| `POST /provider/providers/{provider_id}/benefits/` | prestador titular | Crea oferta en borrador, heredando demo del negocio |
| `GET/PATCH/DELETE /provider/providers/{provider_id}/benefits/{benefit_id}/` | prestador titular | Consulta o modifica; DELETE solo en no publicadas, 409 si está seleccionado |
| `GET .../media/` de la zona `/provider/` | prestador titular | Imagen privada propia |
| `GET /collaborator/folder/` | colaborador habilitado | Referencia actual y prestadores únicos derivados de selecciones vigentes; PATCH sigue 405 |

La edición de una oferta publicada la devuelve a `DRAFT`; el administrador revisa y publica desde Django Admin. Solo Admin asigna el negocio único de cada usuario Prestador, habilita colaboradores y decide publicación. El Colaborador habilitado agrega/quita beneficios concretos de su propia carpeta. Los serializers de escritura rechazan campos ajenos a la lista permitida; `status`, `demo`, titularidad, roles, PIN y créditos no se aceptan en las ofertas. `image_url` apunta a un endpoint autorizado sin token QR; el archivo físico vive en `PRIVATE_MEDIA_ROOT`, fuera de `MEDIA_ROOT`. Admin usa una ruta de medio protegida por sesión y rol administrador. Imágenes: PNG/JPEG/WebP decodificables, máximo 5 MB y 4096 píxeles por lado. Cliente web: eliminar fragmentos QR antes de cargar recursos y mantener `Referrer-Policy: no-referrer`.

### Selección propia del Colaborador y QR del Prestador

Las APIs siguientes requieren JWT de Colaborador activo con perfil propio habilitado y devuelven `Cache-Control: no-store`, también ante errores. El perfil se determina desde la sesión; no se acepta un ID de perfil o prestador en el cuerpo. El interruptor del catálogo público no afecta estas rutas.

| Ruta relativa a `/api/v1/` | Entrada / resultado |
| --- | --- |
| `GET /collaborator/catalog/benefits/?page=1&page_size=24&search=&category=` | `{count,next,previous,results}`, 24 por página y máximo 48. Búsqueda y categoría como el catálogo público; solo publicación/vigencia actual. Cada beneficio contiene `id,title,description,conditions,valid_from,valid_until,demo,provider:{id,name,category,demo}` |
| `GET /collaborator/recommendations/` | `{recommendations:[{benefit_id,available,benefit}]}`. `benefit` contiene el DTO de lectura privado existente más `provider` con ficha y medios privados propios. Si no está disponible, `benefit:null`, sin divulgar contenido borrador |
| `PUT /collaborator/recommendations/{benefit_id}/` | Objeto vacío `{}`; 201 al agregar, 200 al repetir, sin cuerpo de respuesta. Campos extra 400, beneficio no elegible 404, rol/perfil no habilitado 403 |
| `DELETE /collaborator/recommendations/{benefit_id}/` | 204 idempotente, solo selección propia; no afecta otras carpetas |
| `GET /collaborator/recommendations/{benefit_id}/media/` | Imagen solo de una selección propia vigente; 404 si es ajena, no seleccionada o no disponible |
| `GET /collaborator/folder/providers/{provider_id}/media/` | Medio del negocio únicamente si tiene alguna selección propia vigente |

La carpeta propia deduplica negocios; el detalle/medio de oferta del Cliente requiere exactamente la selección elegida, sin heredar otras ofertas o publicaciones futuras. Quitar una selección o perder publicación/vigencia revoca la visibilidad privada en la próxima solicitud, manteniendo el historial.

`GET /provider/providers/{provider_id}/consumption-credential/qr.png` requiere el mismo Prestador titular que la credencial JSON. Genera PNG local con `qrcode`, `no-store`, `no-referrer`, `nosniff` y descarga `consumo.png`. Sin PIN configurado devuelve 404; nunca expone el PIN. La credencial JSON conserva `{configured,qr_url?}` y `PUT {pin}` acepta entre 6 y 12 dígitos, solo escritura.

Para E4, `POST /consumptions/` requiere `Idempotency-Key`, `qr_token` y PIN; `folder_id` admite UUID, `null` u omisión. La respuesta y `GET /me/consumptions/` incluyen `collaborator_id` UUID o `null`. El modo directo omite la atribución; el referido conserva el perfil aportado. Una clave usada entre modos da `409`, mientras que omisión y `null` tienen el mismo replay. El interruptor del catálogo público no impide la acreditación presencial.

`providers.access.locked_provider_eligibility(user, profile_id, provider_id)` se ejecuta dentro de la transacción de acreditación y devuelve `(profile, provider)`; `profile` es `None` solo en modo directo. Orden de bloqueos: usuario turista → perfil colaborador si se aportó → prestador → beneficio publicado/vigente (seleccionado en esa carpeta para el referido) → regla → Wallet. `locked_folder_access` comprueba la referencia actual dentro de la transacción; E3 verifica publicación y `FolderBenefit`. Agregar/quitar selecciones desde API y Admin bloquea perfil → prestador → beneficio, serializando con la acreditación. Los queries con `select_related(user)` usan `FOR UPDATE OF self` para no introducir locks de User después del perfil. Una referencia aportada que falle jamás se degrada a directo. Ninguna ruta acredita sin prestador publicado y beneficio vigente, ni infiere elegibilidad de un `FolderAccess` histórico. Las bajas y cambios de publicación se serializan con los bloqueos correspondientes; el replay financiero permanece intacto.

Errores: 400 entrada o enlace inválido, 401 sesión inválida, 403 rol/carpeta no autorizados o CSRF ausente, 429 límite compartido Redis. Login, solicitud de recuperación y reenvío tienen cuotas independientes por IP de origen y por email normalizado para cada operación; el consumo de reset tiene su propia cuota por origen con el mismo máximo y ventana configurables de recuperación. Un fallo Redis en límites críticos también devuelve 429 cerrado. Recuperación y reenvío responden 202 tanto para emails existentes como desconocidos mientras no se alcance una cuota. Las respuestas de acceso llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.

El origen del límite se toma de `REMOTE_ADDR` en llamadas directas. En Compose, Django confía en la cabecera privada `X-Llave-Client-IP` **solo** cuando el peer TCP coincide exactamente con el hostname `frontend` indicado por `TRUSTED_PROXY_HOST`; Vite descarta `X-Forwarded-For`, `X-Real-IP` y cualquier `X-Llave-Client-IP` entrante, y establece este último con `req.socket.remoteAddress`. Un cliente que llama directamente al puerto 8000 no puede elegir su origen por cabecera. En otro despliegue se debe configurar `TRUSTED_PROXY_HOST` con el hostname/IP exacto del proxy que sanea esa cabecera, o dejarlo vacío para usar únicamente `REMOTE_ADDR`; nunca apuntarlo a toda una subred compartida. La IP representa el cliente visto por el proxy: quienes comparten NAT también comparten la cuota de origen.

El token de referencia va únicamente en el fragmento URL y cuerpo del POST, nunca en query/path o URL de imagen. La futura interfaz debe borrar el fragmento con `history.replaceState` antes de incorporar recursos externos o analítica. Los tokens de email también usan fragmentos y se prueban por API en E2; las pantallas llegarán después de elegir el prototipo F1. No registrar cuerpos de estas solicitudes ni incluir tokens en URLs de métricas. Un QR compartido sigue siendo utilizable hasta que el administrador lo rote o deshabilite.

### Red visual de prestadores

`GET /catalog/network/?page=1` es público y queda cerrado por el interruptor del catálogo. `GET /folders/{folder_id}/network/?page=1` requiere Cliente autenticado con `active_folder_access` vigente; la carpeta y sus asignaciones se vuelven a comprobar en cada página. Ambos devuelven `{count,next,previous,presentation,results}`. `presentation` contiene únicamente `title`, `layout`, `theme`, `background`, `page_size`, `interval_seconds` y `city` (`Ushuaia`). Cada elemento de `results` contiene `provider`, `benefit_id` y `benefit_title`; el público usa `PublicProviderSerializer` y la carpeta usa `ProviderReadSerializer` con sus medios autorizados. No se aceptan parámetros aparte de `page`.

La red agrupa prestadores únicos con al menos un beneficio publicado y vigente y los ordena por nombre/UUID. En la red privada solo considera los beneficios seleccionados en esa carpeta. Si hay varias ofertas elegibles, elige la primera por título/UUID. El tamaño de página nunca lo controla el cliente. `CatalogConfig` define la red general y `CollaboratorProfile` define cada carpeta con título, preset de distribución `RADIAL`/`ORBIT`, tema `SAND`/`OCEAN`, fondo `HARBOR`/`BEAGLE`, tamaño 10–15 (por defecto 12) e intervalo 8–60 segundos (por defecto 10). El Admin solo configura los seis campos de presentación; la página privada no expone IDs de perfil, QR ni relaciones de colaboradores.

### Tienda E5

Catálogo independiente de la red privada: productos activos y sus imágenes son públicos, sin carpetas, prestadores ni QR. Los medios permanecen fuera de MEDIA_ROOT; cada GET revalida que el producto siga activo. Todas las respuestas de tienda incluyen `Cache-Control: no-store`. La previsualización de imágenes inactivas en Admin usa sesión Django y requiere administrador activo, staff y superusuario.

| Ruta relativa a `/api/v1/shop/` | Entrada / resultado |
| --- | --- |
| `GET products/` | Página de 24 productos: `{count,next,previous,results}` |
| `GET products/{uuid}/` | `{id,name,description,stock,price_money,price_credits,image_url}`; 404 si está inactivo |
| `GET products/{uuid}/media/` | Imagen de producto activo; 404 si falta o se desactivó |
| `GET orders/` | Pedidos del Cliente autenticado activo, paginados de 24 |
| `POST orders/` | `Idempotency-Key` obligatorio y `{mode,items:[{product_id,quantity}]}`; 201 nuevo, 200 replay |
| `GET orders/{uuid}/` | Pedido propio; 404 para ajeno |
| `POST orders/{uuid}/cancel/` | `{reason}` de 1–500 caracteres; devuelve solicitud propia abierta existente o nueva con 200 |

Las escrituras requieren Cliente TOURIST activo y email verificado. Prestador, Colaborador y Administrador no compran. `mode` es `CREDITS` o `MONEY`; cada carrito admite 1–20 productos distintos, cantidades JSON enteras de 1–99 por línea. Se rechazan booleanos, strings numéricos, duplicados, campos desconocidos, moneda, total o estado aportados por cliente. Estos límites acotan trabajo transaccional y locks a veinte productos, con cantidades apropiadas al retiro minorista. Precios ARS se serializan como cadenas decimales de dos posiciones; créditos como enteros. El precio null deshabilita esa modalidad.

Pedido: `id,mode,state,currency,total_money,total_credits,pickup_snapshot,created_at,reserved_until,checkout_url,lines,cancellations`. Cada línea conserva `product_id,name,quantity,unit_money,unit_credits`; retiro conserva `{name,address,hours}`. Cada cancelación contiene `id,reason,state,created_at,resolved_at,resolution_reason`. No se exponen ID del cliente, claves de pago ni payload del outbox. El total de la modalidad no utilizada es null; `currency` es ARS y no indica convertibilidad de créditos.

Idempotencia durable por actor/operación/clave ASCII visible de 1–128 caracteres; carrito canónico ordenado por UUID y modalidad. Reordenar las líneas conserva la huella. Carga distinta con la misma clave responde 409; replay devuelve el pedido actual, incluso cancelado/vencido o si después se desactivó el producto, retiro o proveedor monetario. Se siguen exigiendo autorización y email verificado. No se genera otra reserva ni débito.

Canje: PAID y débito de billetera, stock, snapshots y clave se confirman juntos. Stock o saldo insuficiente, canje congelado o retiro no configurado responden 409 sin efectos parciales. Dinero: PENDING_PAYMENT, reserva local de 15 minutos y operación CREATE durable, HTTP posterior en worker con GET autoritativo. `SHOP_PAYMENT_PROVIDER` admite disabled (predeterminado), fake (solo desarrollo/pruebas; prohibido en producción) y mercadopago (requiere configuración y gate sandbox explícitos). El fake es durable DEMO sin enlaces reales. El adaptador real se probó con transporte inyectado, sin sandbox externo. Los workers implementan vencimiento, pagos y reintegros; ninguna acción administrativa confirma dinero manualmente ni libera una compra pagada antes de GET de refund total.

El cliente solicita cancelación antes de entrega; una solicitud abierta bloquea preparar/entregar. Admin rechaza con motivo o aprueba canjes, reintegrando una vez el débito original y restituyendo stock una vez. Aprobar cancelación monetaria pendiente libera reserva una vez; si tiene pago confirmado encola REFUND_PENDING con clave distinta estable y mantiene stock hasta GET de restitución total. Pago posterior a liberar stock pasa a PAYMENT_REVIEW. Las únicas transiciones de preparación/entrega son PAID → READY → PICKED_UP; cualquier operación de refund conserva el bloqueo. Sin PATCH de estado/importes/historia ni DELETE financiero. Ajustes de stock administrativos: delta entero no nulo hasta ±1.000.000 y motivo; stock resultante 0–2.000.000.000, auditado bajo lock. Edición común de producto nunca sobrescribe el stock leído por un formulario viejo.

PostgreSQL protege snapshots, identidad, líneas, claves, auditoría y payload externo. Valida totales contra líneas y existencia de clave al commit; una línea no puede insertarse después de confirmar la clave. Orden de locks: User → Wallet → Order → Product por UUID ascendente. Checkout de pedido nuevo bloquea User/Wallet antes de Product y crea el pedido todavía invisible para otras transacciones; los servicios E4 solo vuelven a adquirir locks ya poseídos. Trabajadores y transiciones sobre pedidos existentes deben usar `shop.services.locked_order` dentro de atomic; ninguna llamada HTTP dentro de esa transacción.

Errores de tienda: 400 formato/campos/carrito; 401 sesión requerida; 403 rol o verificación; 404 producto/pedido no visible; 409 stock, billetera, retiro, modalidad, estado o idempotencia incompatibles. OpenAPI se genera desde serializers y vistas; no se versiona una copia estática.

`POST /api/v1/shop/payments/webhook/?type=order&data.id={id}` exige HMAC específico Orders y devuelve 200 tras inbox durable o 401 genérico. No usa JWT ni acredita dinero por body. Query firmado único, manifest literal con casing/ts preservados, cuerpo máximo 8 KiB, ventana de 10 minutos y 60 segundos futuros. Dedupe por entrega, nunca por ID remoto permanente. Un body firmado dispara GET y cotejos completos; no prueba importes/estado. Inbox temprano y búsqueda por referencia recuperan CREATE incierto aun sin webhook. HTTP fuera de atomic, request/seller congelados y leases/versiones impiden aplicar respuestas obsoletas. Polling incluye PAID/READY/cancelados/vencidos y estados terminales; refund posterior a entrega genera incidencia financiera sin reponer inventario. Guía: [operación E5](shop-operations.md).

Las solicitudes propias de cancelación también admiten `PAYMENT_REVIEW`. Su aprobación libera una reserva nunca acreditada (con o sin ID remoto) si no tiene refund; si tuvo pago confirmado, encola reintegro y retiene stock. La marca interna monotónica `Order.payment_confirmed` distingue ambos casos y no agrega campos al DTO público. El vencimiento usa el mismo criterio para PENDING_PAYMENT/PAYMENT_REVIEW sin pago confirmado. Un fallo permanente de CREATE no extiende la reserva de 15 minutos; clave/payload/referencias permanecen para recuperar pagos tardíos sin habilitar entrega.

### Configuración del sitio y fundamentos administrativos

Las rutas siguientes son relativas a `/api/v1/`. Todas las rutas `/admin/` requieren bearer de un usuario activo con rol `ADMIN`, `is_staff=true` e `is_superuser=true`. Anónimo recibe 401 y privilegios insuficientes 403 antes de acceder a recursos. Respuestas administrativas (incluidos errores) y configuración pública usan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. Las sesiones Django Admin y JWT continúan separadas.

| Ruta | DTO / operación |
| --- | --- |
| `GET /site-settings/` | Anónimo. Exclusivamente `site_name`, `home_title`, `home_description`, `footer_text`, `contact_email`, `whatsapp_url`, `instagram_url` |
| `GET/PATCH /admin/settings/general/` | Los siete campos públicos más `version` |
| `GET/PATCH /admin/settings/catalog/` | `enabled`, `network_title`, `network_layout`, `network_theme`, `network_background`, `network_page_size`, `network_interval_seconds`, `version` |
| `GET/PATCH /admin/settings/credits/` | `base_reward`, `target_visits`, `version` |
| `GET/PATCH /admin/settings/shop/` | `pickup_name`, `pickup_address`, `pickup_hours`, `pickup_enabled`, `payment_provider` de solo lectura y `version` |
| `GET /admin/activity/?search=...&actor=...&action=...&resource=...&page=1&page_size=20` | `{count,next,previous,results}`; 20 por defecto, máximo 100; orden fecha descendente, ID descendente y origen como desempates. `actor` es ID numérico positivo de usuario; acción/recurso exactos. Búsqueda en email del actor, acción, recurso y motivo |

El DTO de actividad contiene solo `id`, `source`, `actor_email`, `action`, `resource`, `object_id`, `changed_fields`, `reason`, `created_at`. La identidad estable de actividad es el par `(source,id)`: `source="admin"` para AdminAudit y `source="order"` para OrderAudit, incluso cuando ambos tienen `resource="orders"`. La auditoría registra nombres de campos modificados, sin sus valores. Configuración usa acción `settings.update` y recurso `settings.general`, `settings.catalog`, `settings.credits` o `settings.shop`; guarda efecto y auditoría en la misma transacción. Una modificación sin cambios efectivos no crea actividad.

GET no crea singletons ausentes: devuelve defaults sin escribir. General reproduce el nombre, título/descripción de portada y pie actuales; contactos vacíos. Catálogo, créditos y retiro leen los modelos existentes `CatalogConfig`, `CreditPolicy` y `ShopSettings`, con defaults del dominio. PATCH crea la fila ausente de forma transaccional y exige `version` del GET en el cuerpo. La versión es un HMAC opaco de recurso/PK/estado persistido; detecta cambios externos al panel. Falta de versión o estado obsoleto: 409 sin escritura ni auditoría, incluso al crear el singleton. Un guardado válido devuelve el DTO completo y la versión vigente.

Solo se admiten campos explícitos; campos extra o de solo lectura enviados dan 400. General exige texto plano sin HTML/control, con límites `site_name` 160, `home_title` 200, `home_description` 1000 y `footer_text` 500; contactos opcionales, email válido, URLs hasta 500. WhatsApp admite solo HTTPS en hosts exactos `wa.me`/`api.whatsapp.com`; Instagram `instagram.com`/`www.instagram.com`. Sin userinfo, hosts similares, puertos distintos de 443, espacios ni barras inversas. Catálogo conserva opciones/rangos existentes (10–15 prestadores, 8–60 segundos). Créditos: recompensa 0–1.000.000 y meta 1–1.000. Retiro habilitado exige punto, dirección y horario completos; límites 160/300/300. Errores no exponen valores privados ni detalles internos de validación de modelos.

Cambiar catálogo afecta la red y visibilidad pública existentes; carpetas/consumos conservan su autorización. Créditos futuros leen la política bloqueada por E4 y conservan snapshots anteriores. Retiro cambia la configuración que E5 copia al crear pedidos; pedidos previos conservan `pickup_snapshot`. `payment_provider` refleja `SHOP_PAYMENT_PROVIDER`, sin editar credenciales ni habilitar pagos desde esta API.

Infraestructura para próximos comandos sensibles: `Idempotency-Key` obligatorio de hasta 128 caracteres, único por actor/acción, carga firmada con HMAC y fila dedicada bloqueada antes de entrar al dominio. Replay devuelve el mismo DTO saneado/código sin repetir el efecto; otra carga con la misma clave devuelve 409. El helper transaccional solo persiste resultados exitosos explícitos y rechaza claves de datos privados en respuestas; no guarda payload de entrada ni PIN/QR/token. Los callbacks deben usar servicios de dominio y auditoría atómica y no hacer HTTP/SMTP dentro de la transacción. La consulta de credenciales es una acción separada que obtiene el QR vigente; no se devuelve una credencial histórica desde un replay.

### Gestión operativa administrativa

Todas las rutas de esta sección son relativas a `/api/v1/admin/` y aplican la misma guarda estricta ADMIN/activo/staff/superusuario a listas, detalles, acciones y archivos. Las colecciones usan `GET <recurso>/?page=1&page_size=20&search=...` y responden `{count,next,previous,results}`; 20 por defecto, máximo 100 y orden por PK descendente. `GET <recurso>/{id}/` devuelve un objeto. Los recursos de solo lectura rechazan POST/PATCH/DELETE con 405. Los IDs de usuarios, billeteras, ajustes, reglas, cancelaciones y ajustes de stock son enteros; prestadores, beneficios, colaboradores, consumos, productos, pedidos y operaciones de pago usan UUID. `image_url` es una ruta local autorizada y puede ser `null`.

| Recurso | Campos de lectura | Escrituras y filtros |
| --- | --- | --- |
| `users` | `id,email,first_name,last_name,role,is_active,email_verified,version` | POST `email,first_name?,last_name?,role` (`TOURIST`,`PROVIDER`,`COLLABORATOR`); PATCH `version,first_name?,last_name?,is_active?`. Filtros `role,is_active,email_verified`; búsqueda email/nombres. No se edita ADMIN, rol, contraseña, verificación ni flags; desactivar revoca sesiones. Alta crea contraseña inutilizable. |
| `providers` | `id,slug,name,category,description,address,hours,contact,map_url,website,image_url,status,demo,provenance,user_ids,version` | POST/PATCH `slug,name,category,description,address,hours,contact,map_url,website,image,status` (`version` solo precondición PATCH). `demo` y `provenance` son readonly. Filtro `status`; búsqueda nombre/slug/categoría/contacto. Imagen multipart `image` o `null`. |
| `benefits` | `id,provider,provider_name,title,description,conditions,valid_from,valid_until,image_url,status,demo,provenance,version` | POST `provider,title,description,conditions,valid_from,valid_until,image,status`; PATCH oferta con `version`, sin cambiar prestador. `demo` de alta hereda prestador; `demo` y `provenance` son readonly. Filtros `provider,status,current=true`; este último aplica publicación y vigencia actual aun si el catálogo público está apagado. Búsqueda título/descripción/negocio. |
| `collaborators` | `id,user,user_email,enabled,network_title,network_layout,network_theme,network_background,network_page_size,network_interval_seconds,benefit_ids,version` | POST `user` de rol Colaborador y presentación; PATCH presentación más `version`, sin cambiar titular ni habilitación. Filtros `enabled,user_active`; búsqueda email/título. `benefit_ids` son selecciones canónicas `FolderBenefit`. |
| `consumptions` | `id,tourist,tourist_email,provider,provider_name,collaborator,collaborator_email,award,rule_snapshot,state,created_at,annulled_at,annul_reason` | Solo lectura. Filtros `state,provider,tourist,collaborator`; búsqueda cliente/negocio. |
| `wallets` | `id,tourist,tourist_email,balance,redemptions_frozen`; detalle agrega `movements:{count,next,previous,results}` con movimientos `id,kind,delta,reference,source_entry,created_at` | Solo lectura. Filtro `tourist`; búsqueda email. Movimientos usan la paginación de la URL de detalle. |
| `adjustments` | `id,consumption,tourist_email,shortfall,funded_amount,forgiven_amount,created_at,resolved_at,resolved_by,resolution,resolution_reason` | Solo lectura. Filtros `tourist,resolved=true|false`; búsqueda email. |
| `products` | `id,name,description,image_url,active,stock,price_money,price_credits,demo,version` | POST/PATCH `name,description,image,active,price_money,price_credits` (`version` solo PATCH). `stock` y `demo` son readonly; filtros `active,stock=0`, búsqueda nombre/descripción. |
| `orders` | Lista resumida: `id,customer,customer_email,mode,state,currency,total_money,total_credits,created_at`. Detalle: los anteriores y `pickup_snapshot,reserved_until,stock_released,payment_provider,payment_confirmed,lines,cancellations,payment_operations,audit` | Solo lectura. Filtros `state,mode,customer`; búsqueda email. Líneas: `product,name,quantity,unit_money,unit_credits`; cancelaciones, operaciones y auditoría usan los DTO de sus recursos sin secretos. No se exponen `remote_id`, URL de checkout ni payload. |
| `cancellations` | `id,order,customer_email,reason,state,created_at,resolved_at,resolved_by,resolution_reason` | Solo lectura. Filtro `state`; búsqueda email. |
| `credit-rules` | `id,provider,provider_name,reward,version` | POST `provider,reward`; PATCH `reward,version` sin cambio de prestador; acción `remove`. Filtro `provider`; búsqueda negocio. |
| `stock-adjustments` | `id,product,product_name,actor_email,delta,resulting_stock,reason,created_at` | Solo lectura. Filtro `product`; búsqueda producto/motivo. |
| `payment-operations` | `id,order,kind,state,attempts,available_at,lease_until,generation,last_code,created_at` | Solo lectura. Filtros `state,kind`; sin carga ni clave externa. |

Los recursos con `created_at` admiten `created_from` y `created_to` (fecha ISO). IDs/filtros booleanos/fechas mal formados devuelven 400 sin eco de valores. PATCH exige `version` vigente como campo de cuerpo, también en multipart. El HMAC incorpora columnas persistidas e imágenes por nombre de archivo; en prestadores incorpora además credencial de consumo y membresías, y en colaboradores las selecciones `FolderBenefit`. Un cambio desde Django Admin, API ajena u otro comando vuelve obsoleta la versión y responde 409. Tras cambiar PIN, QR, membresías o selecciones, la siguiente acción con clave nueva debe usar la versión fresca del detalle; repetir la misma clave conserva el resultado anterior. Campos extra, de solo lectura, medios inválidos y referencias incompatibles reciben 400. Altas devuelven 201 y detalle completo; PATCH devuelve 200 y versión nueva. Nunca se acepta edición directa de historia, saldos, stock absoluto, reglas históricas ni pago remoto.

Los comandos usan `POST <recurso>/{id}/actions/<acción>/`, `Idempotency-Key` obligatorio de hasta 128 caracteres y objeto JSON estricto. Los comandos que tocan formulario (`providers`, `collaborators`, `products`, `credit-rules`) exigen además `version` de su detalle. Respuesta de éxito contiene ID y estado/resultado saneado; replay idéntico conserva resultado sin repetir efecto, una carga distinta con la misma clave da 409. No se devuelve QR/PIN en comandos. `reason` obligatorio tiene 1–500 caracteres para operaciones financieras.

| Recurso | Acción y cuerpo | Resultado |
| --- | --- | --- |
| `providers` | `assign-user {user_id,reassign?,version}`, `unassign-user {user_id,version}`; `set-pin {pin,version}` (6–12 dígitos); `rotate-qr {version}` | Asignación/desasignación `{id,user_id,assigned}`; credencial `{id,status:"updated"}`. Reasignar otro negocio requiere `reassign:true`, conservando unicidad. |
| `collaborators` | `enable`, `disable`, `rotate-qr` con `{version}`; `add-benefit`, `remove-benefit` con `{benefit_id,version}` | `{id,status:"updated"}`. Solo la selección concreta cambia; no se heredan ofertas futuras del negocio. |
| `consumptions` | `annul {reason}` | `{id,state:"ANNULLED",adjustment_id}` (`null` si alcanzó el saldo). |
| `adjustments` | `resolve {resolution,reason}`, resolución `REVERSAL`, `FUNDED` o `FORGIVEN` | `{id,resolution}`. Usa servicio E4 y conserva movimientos de billetera auditados. |
| `products` | `adjust-stock {delta,reason,version}`; delta entero no nulo hasta ±1.000.000 | `{id,stock,adjustment_id}`. Usa ajuste delta E5; una clave repetida no duplica inventario. |
| `orders` | `prepare {reason}`, `deliver {reason}`, `refund {reason}` | `{id,state}`. Reintegro monetario solo encola trabajo E5; no confirma pago ni ejecuta HTTP. |
| `cancellations` | `approve {reason}`, `reject {reason}` | `{id,state}`. Reutiliza resolución E5 y restitución de créditos/stock correspondiente. |
| `payment-operations` | `retry {reason}` | `{id,state:"PENDING"}` solo para operación bloqueada, sin HTTP. |
| `credit-rules` | `remove {version}` | `{id,removed:true}` bajo lock del prestador. |

`POST users/{id}/invite/` usa objeto vacío e `Idempotency-Key`; destinatario activo de rol no ADMIN. Reutiliza token RESET E2 sin exponer enlace ni token. Registra la solicitud en la transacción, envía SMTP después del commit y responde `{id,delivery}` con `SENT` (200), `FAILED` (503) o `PENDING` (200 si el proceso todavía no confirmó el transporte). Repetir clave muestra el estado guardado sin reenviar; una clave nueva reenvía explícitamente. Aplica cuota Redis de recuperación por destinatario. Una entrega fallida no revierte el alta ni afirma envío exitoso.

`GET providers/{id}/qr/` y `GET collaborators/{id}/qr/` devuelven `{url}` con el QR firmado vigente; sus rutas `qr.png` entregan PNG autorizado para mostrar o descargar. El enlace `{url}` apunta a `/consumo#token=...` o `/referencia#token=...` y no es una ruta de imagen/API. Requieren PIN configurado o perfil habilitado, respectivamente; 404 en ausencia. `GET providers/{id}/image/`, `benefits/{id}/image/` y `products/{id}/image/` revalidan ADMIN y existencia del medio por solicitud. Todos usan `no-store`, incluidos errores. `GET collaborators/{id}/recommendations/` devuelve `{recommendations:[{benefit_id,available,benefit}]}`; `benefit` es el DTO administrativo de oferta elegible o `null` si la selección histórica ya no es visible en la red.

`GET dashboard/` es operativo y acotado: `{counts,queues,settings,recent_activity,refreshed_at}`. `counts` tiene `active_users,published_providers,current_benefits,enabled_collaborators`; `queues` tiene `draft_providers,draft_benefits,orders_to_prepare,orders_to_deliver,open_cancellations,payment_reviews,pending_refunds,unresolved_adjustments,out_of_stock_products`. Son conteos actuales, enlazables a las listas por sus filtros. `settings` contiene `catalog_enabled,pickup_enabled,pickup_configured,base_reward,target_visits,payment_provider` y lee defaults sin crear singletons. `recent_activity` incluye hasta diez auditorías administrativas nuevas ordenadas por fecha/ID; `refreshed_at` es timestamp UTC de la consulta. No son analíticas E6.

Filtros de tarjetas/bandeja: `active_users → users/?is_active=true`; `published_providers → providers/?status=PUBLISHED`; `current_benefits → benefits/?current=true`; `enabled_collaborators → collaborators/?enabled=true&user_active=true`; borradores por `status=DRAFT`; pedidos por `state=PAID|READY|PAYMENT_REVIEW|REFUND_PENDING`; cancelaciones por `state=OPEN`; ajustes por `resolved=false`; productos sin stock por `active=true&stock=0`. `GET activity/` incluye tanto auditorías del panel como `OrderAudit` existente, en el mismo DTO saneado; para estas últimas `resource="orders"` y `object_id` es el pedido.

Validación administrativa: las respuestas 400 asocian listas de mensajes seguros a los campos permitidos y usan `non_field_errors` para errores globales. Publicar un beneficio requiere condiciones; las fechas invertidas identifican `valid_from` y `valid_until`, también en PATCH parcial. Los errores internos de modelos se sanean sin devolver valores privados, SQL ni mensajes arbitrarios de `full_clean`. Un 409 conserva la semántica de versión/idempotencia y no es validación de campos.

Deuda de escala explícita: la lista de pedidos usa un DTO resumido y no precarga historias. Las historias del detalle de pedido y las selecciones/recomendaciones de carpeta conservan el contrato completo actual, sin paginación independiente; fichas o carpetas muy grandes pueden ser costosas. No se ha validado carga ni se define un umbral operativo en esta etapa.
