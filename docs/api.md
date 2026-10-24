# Contrato de API E3–E5 y catálogo público

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

Las rutas siguientes son anónimas, de solo lectura y siempre responden `Cache-Control: no-store`. El interruptor `providers.CatalogConfig` se edita únicamente desde Django Admin por un superusuario activo con rol `ADMIN`; arranca habilitado. Al deshabilitarlo, `config/` responde `200 {"enabled": false}` y todas las demás rutas públicas del catálogo responden 404, incluso por URL directa. Esto no modifica las rutas de carpeta ni la elegibilidad de consumo.

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

El cliente solicita cancelación antes de entrega; una solicitud abierta bloquea preparar/entregar. Admin rechaza con motivo o aprueba canjes, reintegrando una vez el débito original y restituyendo stock una vez. Aprobar cancelación monetaria pendiente libera reserva una vez; si estaba pagada/revisada encola REFUND_PENDING con clave distinta estable y mantiene stock hasta GET de restitución total. Pago posterior a liberar stock pasa a PAYMENT_REVIEW. Las únicas transiciones de preparación/entrega son PAID → READY → PICKED_UP; cualquier operación de refund conserva el bloqueo. Sin PATCH de estado/importes/historia ni DELETE financiero. Ajustes de stock administrativos: delta entero no nulo hasta ±1.000.000 y motivo; stock resultante 0–2.000.000.000, auditado bajo lock. Edición común de producto nunca sobrescribe el stock leído por un formulario viejo.

PostgreSQL protege snapshots, identidad, líneas, claves, auditoría y payload externo. Valida totales contra líneas y existencia de clave al commit; una línea no puede insertarse después de confirmar la clave. Orden de locks: User → Wallet → Order → Product por UUID ascendente. Checkout de pedido nuevo bloquea User/Wallet antes de Product y crea el pedido todavía invisible para otras transacciones; los servicios E4 solo vuelven a adquirir locks ya poseídos. Trabajadores y transiciones sobre pedidos existentes deben usar `shop.services.locked_order` dentro de atomic; ninguna llamada HTTP dentro de esa transacción.

Errores de tienda: 400 formato/campos/carrito; 401 sesión requerida; 403 rol o verificación; 404 producto/pedido no visible; 409 stock, billetera, retiro, modalidad, estado o idempotencia incompatibles. OpenAPI se genera desde serializers y vistas; no se versiona una copia estática.

`POST /api/v1/shop/payments/webhook/?type=order&data.id={id}` exige HMAC específico Orders y devuelve 200 tras inbox durable o 401 genérico. No usa JWT ni acredita dinero por body. Query firmado único, manifest literal con casing/ts preservados, cuerpo máximo 8 KiB, ventana de 10 minutos y 60 segundos futuros. Dedupe por entrega, nunca por ID remoto permanente. Un body firmado dispara GET y cotejos completos; no prueba importes/estado. Inbox temprano y búsqueda por referencia recuperan CREATE incierto aun sin webhook. HTTP fuera de atomic, request/seller congelados y leases/versiones impiden aplicar respuestas obsoletas. Polling incluye PAID/READY/cancelados/vencidos y estados terminales; refund posterior a entrega genera incidencia financiera sin reponer inventario. Guía: [operación E5](shop-operations.md).
