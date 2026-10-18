# Contrato de API E2

Fuente ejecutable: `backend/config/urls.py` y los `@extend_schema` de `backend/accounts/views.py` y `backend/referrals/views.py`. Generar y validar con `docker compose exec -T backend python manage.py spectacular --file /tmp/llave-extra-openapi.yaml --validate`; el esquema interactivo está en `/api/docs/` y JSON/YAML en `/api/schema/`. Cambios incompatibles requieren una nueva versión de ruta `/api/vN/`; campos nuevos opcionales no cambian versión.

Todas las rutas de dominio usan `/api/v1/`. `GET /auth/csrf/` entrega token CSRF y cookie; enviarlo como `X-CSRFToken` en los POST de autenticación. El frontend futuro usará el proxy Vite del mismo origen. No se configura CORS con credenciales abiertas. `POST /auth/login/` devuelve `access` y deja refresh en cookie `HttpOnly` con ruta `/api/v1/auth/`; `POST /auth/refresh/` lo rota y devuelve nuevo `access`; `POST /auth/logout/` revoca sesión y borra cookie. Si la cookie falta, logout acepta un access bearer válido para revocar la sesión. Access dura 5 minutos, refresh 7 días. `GET /auth/me/` requiere `Authorization: Bearer <access>`.

| Ruta | Entrada | Resultado |
| --- | --- | --- |
| `POST /auth/register/` | `email`, `password`, `referral_token` opcional | 201: cuenta `TOURIST`, email pendiente; referencia válida se redime atómicamente |
| `POST /auth/verify-email/` | `token` | 200: email verificado; token de un uso, 24 h |
| `POST /auth/resend-verification/` | `email` | 202 genérico |
| `POST /auth/forgot-password/` | `email` | 202 genérico |
| `POST /auth/reset-password/` | `token`, `password` | 200: contraseña nueva, sesiones revocadas; token de un uso, 1 h |
| `POST /referrals/redeem/` | `token` de QR en cuerpo; bearer | 200: grant idempotente al turista autenticado |
| `GET /me/folders/` | bearer turista | Solo IDs de referencias activas; sin prestadores hasta E3 |
| `GET /collaborator/qr/` | bearer colaborador habilitado | URL firmada actual; `qr.png` descarga la imagen |

Errores: 400 entrada o enlace inválido, 401 sesión inválida, 403 rol/carpeta no autorizados o CSRF ausente, 429 límite compartido Redis. Un fallo Redis en límites críticos también devuelve 429 cerrado. Recuperación y reenvío siempre responden 202 tanto para emails existentes como desconocidos. Las respuestas de acceso llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.

El token de referencia va únicamente en el fragmento URL y cuerpo del POST, nunca en query/path o URL de imagen. La futura interfaz debe borrar el fragmento con `history.replaceState` antes de incorporar recursos externos o analítica. Los tokens de email también usan fragmentos y se prueban por API en E2; las pantallas llegarán después de elegir el prototipo F1. No registrar cuerpos de estas solicitudes ni incluir tokens en URLs de métricas. Un QR compartido sigue siendo utilizable hasta que el administrador lo rote o deshabilite.
