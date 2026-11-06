# Inventario estático de superficies — corte 7467838

Fuente: `backend/config/urls.py`, los `urls.py` de apps, `docs/sitemap.md`, `docs/api.md`, `frontend/src/App.tsx` y `product/ProductApp.tsx`. Es un mapa de cobertura, no evaluación ni prueba. Los actores y relaciones describen expectativa derivada de contrato; cada ruta real debe revalidar en servidor.

IDs refieren a controles de `docs/security/checklist.md` (sin cambiar IDs). Leyenda útil: B01/B05, A01–A10, T01–T08, R01–R08, P01–P08, C01–C08, S01–S15, M01–M08, F01–F06, O01/O03/O07.

| Familia/rutas | Actor esperado | Relación con objeto / frontera | Métodos de escritura | Checklist |
|---|---|---|---|---|
| `/api/v1/health/` | Anónimo/monitor | Salud de servicio; sin dominio | Ninguno (GET) | B01,B05,O01 |
| `/api/v1/auth/{csrf,register,login,me,refresh,logout,verify-email,resend-verification,forgot-password,reset-password}/` | Anónimo; sesión propia según operación | Cuenta por email; registro solo TOURIST; tokens de un uso y sesión propia | POST; me GET; csrf GET; logout POST | A01–A10,T01–T08,F04 |
| `/api/v1/referrals/redeem/`, `/me/folders/`, `/collaborator/qr[.png]`, `/collaborator/qr/renew/` | TOURIST para redimir/listar; COLLABORATOR habilitado para QR propio | Referencia QR enlaza perfil al Cliente; QR propio del colaborador; no aceptar IDs arbitrarios | redeem POST; renew POST idempotente; resto GET | R01,R02,R04,R07,T07,F04,O01 |
| Catálogo público `/catalog/{config,categories,network,benefits,...}` y media | Anónimo | Solo beneficios/prestadores publicados y vigentes; interruptor de catálogo | GET | P04–P08,F01,F05,O01 |
| Carpetas `/folders/{folder}/...` (beneficios, red, prestadores, medios) | TOURIST con grant QR vigente | Cada solicitud verifica grant activo y `FolderBenefit`; IDs ajenos/revocados no autorizan | GET únicamente | R02–R05,P05,P06,P08,F02,O01 |
| API `/collaborator/{catalog, recommendations, folder,...}` | COLLABORATOR activo/habilitado, perfil propio | Selección concreta de FolderBenefit propia; medios solo selección vigente | PUT/DELETE recommendation; GET demás | R04,R06–R08,P06,F02,O01 |
| API `/provider/providers/...`, beneficios, medios y credencial QR/PIN | PROVIDER titular asignado | Solo su único prestador y sus ofertas, incluso borradores en zona privada | PATCH negocio; POST/GET/PATCH/DELETE beneficio con límites; PUT PIN; GET media/QR | P01–P03,P06–P07,C08,R07,O01 |
| `/api/v1/consumptions/`, `/me/{wallet,consumptions,progress}/` | Cliente TOURIST activo y verificado; lectura solo titular | QR negocio + PIN; referido requiere selección concreta vigente y grant actual; historial/saldo propios | POST consumption; GET lecturas | C01–C08,R03,R08,F05,O01 |
| `/api/v1/shop/{catalog,products,products/{id},.../media}` | Anónimo | Productos/categorías públicos activos | GET | S02,F05,P06,O01 |
| `/api/v1/shop/orders/`, `/orders/{id}/`, `/cancel/` | TOURIST activo para leer pedidos propios; verificación para checkout según la operación | Checkout aplica precios, stock, saldo y snapshots servidor; IDs ajenos 404 | POST order/cancel; GET list/detail | S01–S08,F05,O01 |
| `/api/v1/shop/payments/webhook/` | Proveedor remoto autenticado por HMAC, no JWT | Inbox de notificación; webhook solo dispara conciliación GET autoritativa | POST | S09–S14,O01,O03 |
| `/api/v1/shop/admin/media/<path>` | Admin Django autenticado, activo, staff y superusuario | Preview de producto inactivo en storage privado | GET | M01–M03,P06,O01 |
| `/api/v1/site-settings/` | Anónimo | DTO de textos/contactos públicos únicamente | GET | M03,O01 |
| `/api/v1/admin/settings/*`, activity/dashboard, recursos y acciones `/admin/*` | ADMIN activo, `is_staff`, `is_superuser` | Configuración/recursos administrativos; comandos con versión/idempotencia/auditoría; medios/QR bajo autorización | GET; PATCH settings/resources; POST altas/invitaciones/acciones; medios y QR GET. Recursos read-only rechazan escrituras | M01,M03–M08,P02,S05–S08,F02,O01 |
| `/api/v1/admin/private-media/<path>`, `/api/v1/admin/<resource>/<uuid>/{image,qr,qr.png}` | Admin con sesión Django para private-media; ADMIN con bearer para image/qr/qr.png | Medios privados o credenciales regeneradas, nunca secretos de negocio en replay | GET | M01,M06,P06,O01,T07 |
| `/admin/` (Django Admin) | Sesión Django; superusuario/staff y permisos efectivos del modelo | Interfaz técnica separada de JWT; cambios de publicación/configuración/dominio sujetos a permisos y protecciones propias | GET y formularios POST; métodos por ModelAdmin | A09,M02,M06–M08,P02,P03,R06–R08,S05–S08 |
| `/api/schema/`, `/api/docs/` | Anónimo según configuración declarada | Contrato/schema; revisar filtración de detalles internos | GET | B01,B05,O01 |
| Frontend `/`, `/beneficios[/id]`, `/tienda[/slug]`, `/creditos-imagenes` | Público; sesión opcional | Catálogo público; tienda conectada al catálogo real y sin compra/canje en React; fuentes/créditos imágenes | No hay mutación de dominio en tienda preview | F01,F02,F05,O07 |
| Frontend `/registro`, `/ingresar`, `/recuperar`, `/restablecer-clave`, `/verificar-email` | Anónimo / dueño de token | Flujos de cuenta; credenciales llegan por fragmento donde aplica | Envío de formularios a API | A01–A10,T01–T08,F03–F04 |
| Frontend `/referencia`, `/recomendaciones` legado → `/beneficios`, `/consumo`, `/mi-viaje`, `/perfil` | Cliente según sesión; consumir requiere verificación | Contexto QR por pestaña y revalidación servidor; lectura propia | consumo POST; otras pantallas llaman lecturas/redención | R02–R05,C01–C08,F02–F04 |
| Frontend `/espacio`, `/prestador/*`, `/colaborador/*`, `/gestion/*` | Rol correspondiente; UI no es control de autorización | Paneles de rol y operaciones; comprobar deep links y APIs | Ver familias API correspondientes | F02,F03,M01–M08,P01,R06–R08,S01–S08 |
| Comandos `seed_demo`, `seed_activity_demo`, `seed_demo_media`, `seed_shop_demo`, `simulate_shop_payment` | Operador local explícito; demos restringidos a DEBUG/PostgreSQL y fake según comando | Datos sintéticos namespace/checkpoints; simulación no prueba integración externa | Escritura de datos sintéticos / simulación | B01,B02,O03,O07,S14–S15 |
| Comandos `process_shop_outbox`, `reconcile_shop_orders`, `expire_shop_orders` | Worker/operador de infraestructura | Outbox, conciliación remota, expiración bajo reglas financieras e idempotencia | Efectos durables de pedidos/pagos/stock | B01,O03,S07–S14 |
| URLs externas/proxy y tareas no expresadas como Django route | Proxy frontend Vite sanea IP; correo/Redis/storage/worker dependen infraestructura | No son rutas de app; revisar configuración, origen, credenciales, logging y transporte | SMTP/webhook saliente/worker | B02–B07,A06–A09,O02–O05 |

## Límites de alcance señalados por fuentes

- E6 analíticas completas no implementadas; el resumen acotado del colaborador existe y no debe tratarse como E6. No inventariar endpoints analíticos no declarados.
- Compra/canje desde UI de `/tienda` pendiente: la UI consume el catálogo real; el backend E5 expone pedidos y webhook.
- Validación contra sandbox externo de Mercado Pago pendiente; adaptador con transporte simulado/injectado no lo acredita (S15).
- El sitemap se declara provisorio. React es un despachador por `window.location.pathname`, no router declarativo; rutas `/recomendaciones` se normalizan a `/beneficios`, y la autorización visible es solo UX.
- Los comandos son superficies operativas no incluidas en OpenAPI. El [inventario del resolver](runs/20261105-1823-7467838/rutas.md) enumera 318 rutas, incluidos patrones de Django Admin y métodos derivados de las vistas.

## Matriz base y fuentes

Los fixtures del laboratorio incluyen dos Clientes verificados, uno sin verificar y uno inactivo. Incluyen dos colaboradores habilitados con carpetas y selecciones diferentes, uno deshabilitado, dos Prestadores asignados a negocios distintos y uno sin negocio. El ADMIN completo se contrasta con un ADMIN sin superusuario y con los roles de programa. Cada denegación de escritura requiere comprobar también la fila, vínculo o historial afectado. La matriz base se amplía por endpoint, método, actor, relación y variante.

| Controles | Referencias metodológicas | Aplicación |
| --- | --- | --- |
| A, T | ASVS 5.0.0 V6/V7/V9; WSTG 4.2 4.4/4.6; API2 | Identidad, JWT, sesiones, recuperación, límites y aislamiento entre pestañas. |
| R, P, M, S01, C08 | ASVS V5/V8/V14; WSTG 4.2 4.5; API1/API3/API5 | Autorización por objeto y rol, campos privados, medios y revocación. |
| C, S, A07 | ASVS V2/V4/V11; WSTG 4.2 4.10; API4/API6/API10 | Reglas de crédito y stock, firma, idempotencia, cuotas y conciliación. |
| B, F, O | ASVS V2/V3/V12/V13/V14/V16; WSTG 4.2 4.2/4.7/4.11; API8/API9 | Entrada, errores, configuración, inventario, navegador y exposición. |

Referencias de la campaña. [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0), [WSTG 4.2](https://wstg.owasp.org/v4.2/) y [API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/). La asignación por capítulo orienta la campaña. El mapeo exhaustivo de requisitos L2 sigue pendiente.
