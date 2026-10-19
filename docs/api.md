# Contrato de API E3

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

Todas estas rutas requieren autenticación. `folder_id`, `provider_id` y `benefit_id` son UUID. Para turistas, la autorización se comprueba en **cada** listado, detalle y medio mediante `active_folder_access` (rol y grant de versión QR vigente), asignación `FolderProvider` y publicación. Un ID cruzado o revocado responde 404. Parámetros de búsqueda desconocidos no amplían la consulta. No hay catálogo global público ni roster de carpetas.

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

Para E4, `providers.access.locked_provider_eligibility(user, profile_id, provider_id)` abre transacción y devuelve `(profile, provider)` bajo bloqueo. Mantener el contexto durante toda la acreditación. Orden de bloqueos: usuario turista → perfil colaborador → prestador. El helper E2 `locked_folder_access` obtiene los dos primeros y verifica grant actual; E3 bloquea el prestador y verifica publicación y `FolderProvider`. Bajas/rotaciones de perfil y cambios de publicación/asignación usan esos mismos bloqueos. No inferir elegibilidad de un `FolderAccess` histórico ni leer `FolderProvider` fuera del contexto al acreditar.

Errores: 400 entrada o enlace inválido, 401 sesión inválida, 403 rol/carpeta no autorizados o CSRF ausente, 429 límite compartido Redis. Login, solicitud de recuperación y reenvío tienen cuotas independientes por IP de origen y por email normalizado para cada operación; el consumo de reset tiene su propia cuota por origen con el mismo máximo y ventana configurables de recuperación. Un fallo Redis en límites críticos también devuelve 429 cerrado. Recuperación y reenvío responden 202 tanto para emails existentes como desconocidos mientras no se alcance una cuota. Las respuestas de acceso llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.

El origen del límite se toma de `REMOTE_ADDR` en llamadas directas. En Compose, Django confía en la cabecera privada `X-Llave-Client-IP` **solo** cuando el peer TCP coincide exactamente con el hostname `frontend` indicado por `TRUSTED_PROXY_HOST`; Vite descarta `X-Forwarded-For`, `X-Real-IP` y cualquier `X-Llave-Client-IP` entrante, y establece este último con `req.socket.remoteAddress`. Un cliente que llama directamente al puerto 8000 no puede elegir su origen por cabecera. En otro despliegue se debe configurar `TRUSTED_PROXY_HOST` con el hostname/IP exacto del proxy que sanea esa cabecera, o dejarlo vacío para usar únicamente `REMOTE_ADDR`; nunca apuntarlo a toda una subred compartida. La IP representa el cliente visto por el proxy: quienes comparten NAT también comparten la cuota de origen.

El token de referencia va únicamente en el fragmento URL y cuerpo del POST, nunca en query/path o URL de imagen. La futura interfaz debe borrar el fragmento con `history.replaceState` antes de incorporar recursos externos o analítica. Los tokens de email también usan fragmentos y se prueban por API en E2; las pantallas llegarán después de elegir el prototipo F1. No registrar cuerpos de estas solicitudes ni incluir tokens en URLs de métricas. Un QR compartido sigue siendo utilizable hasta que el administrador lo rote o deshabilite.
