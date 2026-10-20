# Contrato de API E3–E4 y catálogo público

Fuente ejecutable: `backend/config/urls.py` y los `@extend_schema` de `backend/accounts/views.py`, `backend/referrals/views.py` y `backend/providers/views.py`. Generar y validar con `docker compose exec -T backend python manage.py spectacular --file /tmp/llave-extra-openapi.yaml --validate`; el esquema interactivo está en `/api/docs/` y JSON/YAML en `/api/schema/`. Cambios incompatibles requieren una nueva versión de ruta `/api/vN/`; campos nuevos opcionales no cambian versión. Cliente es el nombre de producto del rol técnico `TOURIST`; hay cuatro roles en total.

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

Todas estas rutas requieren autenticación. `folder_id`, `provider_id` y `benefit_id` son UUID. Para turistas, la autorización se comprueba en **cada** listado, detalle y medio mediante `active_folder_access` (rol y grant de versión QR vigente), asignación `FolderProvider` y publicación. Un ID cruzado o revocado responde 404. Parámetros de búsqueda desconocidos no amplían la consulta. No hay roster público de carpetas.

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
| `GET /folders/{folder_id}/providers/` | turista con grant activo | Prestadores publicados asignados a esa carpeta |
| `GET /folders/{folder_id}/providers/{provider_id}/` | idem | Ficha del prestador |
| `GET /folders/{folder_id}/providers/{provider_id}/benefits/` | idem | Beneficios publicados y vigentes |
| `GET /folders/{folder_id}/providers/{provider_id}/benefits/{benefit_id}/` | idem | Beneficio autorizado |
| `GET .../media/` en ficha o beneficio | idem | Imagen privada, si existe |
| `GET /provider/providers/` y `GET /provider/providers/{provider_id}/` | prestador con membresía | Negocios propios, incluso borradores |
| `PATCH /provider/providers/{provider_id}/` | prestador titular | Solo descripción, domicilio, horarios, contacto, mapa, web e imagen |
| `GET /provider/providers/{provider_id}/benefits/` | prestador titular | Ofertas propias, incluyendo borradores |
| `POST /provider/providers/{provider_id}/benefits/` | prestador titular | Crea oferta en borrador |
| `GET/PATCH/DELETE /provider/providers/{provider_id}/benefits/{benefit_id}/` | prestador titular | Consulta o modifica; DELETE solo en no publicadas |
| `GET .../media/` de la zona `/provider/` | prestador titular | Imagen privada propia |
| `GET /collaborator/folder/` | colaborador habilitado | Referencia actual y prestadores publicados de su carpeta, solo lectura |

La edición de una oferta publicada la devuelve a `DRAFT`; el administrador revisa y publica desde Django Admin. Solo Admin asigna carpetas y membresías, habilita colaboradores y decide publicación. Los serializers de escritura rechazan campos ajenos a la lista permitida; `status`, titularidad, roles, PIN y créditos no se aceptan. `image_url` apunta a un endpoint autorizado sin token QR; el archivo físico vive en `PRIVATE_MEDIA_ROOT`, fuera de `MEDIA_ROOT`. Admin usa una ruta de medio protegida por sesión y rol administrador. Imágenes: PNG/JPEG/WebP decodificables, máximo 5 MB y 4096 píxeles por lado. Cliente web: eliminar fragmentos QR antes de cargar recursos y mantener `Referrer-Policy: no-referrer`.

Para E4, `POST /consumptions/` requiere `Idempotency-Key`, `qr_token` y PIN; `folder_id` admite UUID, `null` u omisión. La respuesta y `GET /me/consumptions/` incluyen `collaborator_id` UUID o `null`. El modo directo omite la atribución; el referido conserva el perfil aportado. Una clave usada entre modos da `409`, mientras que omisión y `null` tienen el mismo replay. El interruptor del catálogo público no impide la acreditación presencial.

`providers.access.locked_provider_eligibility(user, profile_id, provider_id)` se ejecuta dentro de la transacción de acreditación y devuelve `(profile, provider)`; `profile` es `None` solo en modo directo. Orden de bloqueos: usuario turista → perfil colaborador si se aportó → prestador → beneficio publicado/vigente → regla → Wallet. `locked_folder_access` comprueba la referencia actual dentro de la transacción; E3 verifica publicación y `FolderProvider`. Una referencia aportada que falle jamás se degrada a directo. Ninguna ruta acredita sin prestador publicado y beneficio vigente, ni infiere elegibilidad de un `FolderAccess` histórico. Las bajas y cambios de publicación se serializan con los bloqueos correspondientes.

Errores: 400 entrada o enlace inválido, 401 sesión inválida, 403 rol/carpeta no autorizados o CSRF ausente, 429 límite compartido Redis. Login, solicitud de recuperación y reenvío tienen cuotas independientes por IP de origen y por email normalizado para cada operación; el consumo de reset tiene su propia cuota por origen con el mismo máximo y ventana configurables de recuperación. Un fallo Redis en límites críticos también devuelve 429 cerrado. Recuperación y reenvío responden 202 tanto para emails existentes como desconocidos mientras no se alcance una cuota. Las respuestas de acceso llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.

El origen del límite se toma de `REMOTE_ADDR` en llamadas directas. En Compose, Django confía en la cabecera privada `X-Llave-Client-IP` **solo** cuando el peer TCP coincide exactamente con el hostname `frontend` indicado por `TRUSTED_PROXY_HOST`; Vite descarta `X-Forwarded-For`, `X-Real-IP` y cualquier `X-Llave-Client-IP` entrante, y establece este último con `req.socket.remoteAddress`. Un cliente que llama directamente al puerto 8000 no puede elegir su origen por cabecera. En otro despliegue se debe configurar `TRUSTED_PROXY_HOST` con el hostname/IP exacto del proxy que sanea esa cabecera, o dejarlo vacío para usar únicamente `REMOTE_ADDR`; nunca apuntarlo a toda una subred compartida. La IP representa el cliente visto por el proxy: quienes comparten NAT también comparten la cuota de origen.

El token de referencia va únicamente en el fragmento URL y cuerpo del POST, nunca en query/path o URL de imagen. La futura interfaz debe borrar el fragmento con `history.replaceState` antes de incorporar recursos externos o analítica. Los tokens de email también usan fragmentos y se prueban por API en E2; las pantallas llegarán después de elegir el prototipo F1. No registrar cuerpos de estas solicitudes ni incluir tokens en URLs de métricas. Un QR compartido sigue siendo utilizable hasta que el administrador lo rote o deshabilite.

### Red visual de prestadores

`GET /catalog/network/?page=1` es público y queda cerrado por el interruptor del catálogo. `GET /folders/{folder_id}/network/?page=1` requiere Cliente autenticado con `active_folder_access` vigente; la carpeta y sus asignaciones se vuelven a comprobar en cada página. Ambos devuelven `{count,next,previous,presentation,results}`. `presentation` contiene únicamente `title`, `layout`, `theme`, `background`, `page_size`, `interval_seconds` y `city` (`Ushuaia`). Cada elemento de `results` contiene `provider`, `benefit_id` y `benefit_title`; el público usa `PublicProviderSerializer` y la carpeta usa `ProviderReadSerializer` con sus medios autorizados. No se aceptan parámetros aparte de `page`.

La red agrupa prestadores únicos con al menos un beneficio publicado y vigente y los ordena por nombre/UUID. Si hay varias ofertas elegibles, elige la primera por título/UUID. El tamaño de página nunca lo controla el cliente. `CatalogConfig` define la red general y `CollaboratorProfile` define cada carpeta con título, preset de distribución `RADIAL`/`ORBIT`, tema `SAND`/`OCEAN`, fondo `HARBOR`/`BEAGLE`, tamaño 10–15 (por defecto 12) e intervalo 8–60 segundos (por defecto 10). El Admin solo configura los seis campos de presentación; la página privada no expone IDs de perfil, QR ni relaciones de colaboradores.
