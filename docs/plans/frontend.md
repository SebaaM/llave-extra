# F1 · Tres prototipos de frontend (archivo histórico)

> Los tres prototipos y `/prototipos` se retiraron en la corrección del 19/10/2026. Las rutas vigentes son `/` para portada, `/beneficios` para catálogo público, `/beneficios/<id>` para detalle, `/recomendaciones` para carpetas QR privadas y `/mi-viaje` para Pasaporte. Lo que sigue documenta la evaluación histórica F1/F2.

## Alcance entregado

Tres direcciones navegables bajo `/prototipos`, hechas en React, TypeScript y Tailwind. Comparten identidad Llave Extra y un modelo de demostración, pero cada una organiza el contenido de manera diferente. Son opciones para elegir, no un frontend conectado al dominio.

El encabezado reutiliza el logo público verificado de Llave Extra, incluido como archivo local. La llave y el wordmark son los del recurso publicado; las formas abstractas de cada variante son ilustraciones de los prototipos.

| Opción | Ruta | Fortaleza | Compromiso |
| --- | --- | --- | --- |
| Guía local | `/prototipos/guia` | Descubrimiento editorial, búsqueda y categorías dentro de la carpeta. | El progreso queda en Mi viaje. |
| Pasaporte | `/prototipos/pasaporte` | Visitas, sellos y próxima parada como centro de la experiencia. | La comparación de beneficios requiere abrir fichas. |
| Beneficios | `/prototipos/beneficios` | Comparación rápida de ofertas y condiciones. | Menor espacio para narrar el destino. |

Cada ruta incluye portada pública, registro, ingreso, recuperación, QR simulado, carpeta privada demo, ficha, perfil con créditos/progreso y vista previa de tienda. El selector está en `/prototipos`.

## Límite del prototipo

El inventario público de demostración forma parte del bundle estático, pero las pantallas públicas no lo enumeran: el gate local solo controla su presentación. No se incluyen datos privados reales en ese mock. Los nombres y beneficios vienen de un inventario público histórico, pero la pertenencia a “Carpeta Faro” es ficticia y las condiciones requieren revisión. No se almacenan contraseñas ni tokens de sesión; el estado demo se mantiene en `sessionStorage` de la pestaña. El código `DEMO-FARO` habilita la carpeta y `DEMO-PAUSADO` muestra revocación simulada. Ninguno es un QR real. Para el consumo se simula primero la lectura del QR del prestador y después el PIN 1234; los productos de tienda son exclusivamente ilustrativos. No hay checkout, reserva de stock, correo enviado ni acreditación del servidor.

El servicio demo estuvo aislado bajo `/prototipos` y fue retirado. La experiencia funcional consume el contrato OpenAPI de E2–E4 y del catálogo público. El servidor autoriza cada recomendación por QR válido, colaborador habilitado y pertenencia del prestador a la carpeta; controla email verificado, unicidad de consumos, créditos e idempotencia.

## Dirección elegida y siguientes entregas

El usuario eligió **Beneficios** para la portada y el enfoque **Pasaporte** para Mi viaje el 18-10-2026. F2 implementa ese recorrido funcional conectado a las APIs de E2–E4. La portada explica el valor potencial de encontrar descuentos y promociones en las carpetas compartidas, sin afirmar acuerdos comerciales ni cifras no confirmados.

La experiencia de producto está aislada en `src/product/`: `ProductApp` organiza rutas y estado de la shell, mientras `api`, `PublicPages`, `ReferencePage`, `BenefitsPages`, `ConsumptionPage` y `JourneyPage` separan autenticación, referencias, catálogo autorizado, consumo y pasaporte. El cliente usa access JWT solo en memoria, refresh HttpOnly por same-origin, CSRF para acciones de autenticación, refresh concurrente de una sola llamada, cancelación/versionado de datos privados al cambiar la sesión, API same-origin y respuestas privadas `no-store`. Refresh, login y logout se serializan con Web Locks por origen para que respuestas `Set-Cookie` no se crucen entre pestañas; si el navegador no ofrece Web Locks o no está en un secure context, no se envían mutaciones de autenticación. Un cambio de cuenta limpia la pantalla privada antes de empezar el login y cada carga valida identidad, versión de sesión y carpeta antes de guardar resultados. Al cambiar carpeta se retira el listado anterior y una respuesta `401/403` de beneficios quita la ficha privada. Las imágenes privadas usan descarga autorizada como Blob, comprueban la versión después de leerlo y revocan la Object URL también si llega tras desmontar la vista. Un logout no confirmado quita los datos locales y deja un marcador no secreto en `sessionStorage` de esa pestaña; el cliente no restaura silenciosamente la cookie refresh al recargar y muestra que la revocación del servidor sigue sin confirmar. Los QR de referencia, verificación y consumo se leen desde `location.hash`, se eliminan de la URL y se retienen solo en memoria.

Rutas de producto: `/` portada, `/beneficios` catálogo público, `/beneficios/<id>` detalle público, `/recomendaciones` red privada, `/registro`, `/ingresar`, `/recuperar`, `/restablecer-clave`, `/verificar-email`, `/referencia`, `/consumo`, `/mi-viaje`, `/perfil` y `/creditos-imagenes`. El registro crea solo `TOURIST`. QR de colaborador permite crear/redimir una referencia; QR de prestador permite proponer la validación directa o referida del consumo con PIN y `Idempotency-Key`. El alcance operativo de paneles de red se adelanta mediante el plan 08; tienda y analíticas siguen pendientes.

F3 sigue a F2 y cubre tienda, pedidos y espacios separados de Colaborador, Prestador y Administrador. Cada área respetará los permisos del servidor y el backoffice existente.

## Verificación

Los comandos y resultados históricos de F1 se conservan en `docs/frontend-prototipos.md`; la migración actual de uv/pnpm se documenta en el informe Task 8. La implementación, contratos, pruebas y límites de verificación de F2 se registran en `.superpowers/sdd/00-roadmap/task-9-report.md`, distinguiendo pruebas mock de las respuestas HTTP reales.
## Espacios de acceso y permisos previstos

La experiencia principal del producto corresponde al Cliente (`TOURIST`): consulta el catálogo público y, si obtuvo acceso por QR, sus recomendaciones autorizadas; gestiona perfil, progreso y créditos. El Colaborador (`COLLABORATOR`) dispone de su carpeta con selección concreta de beneficios y QR propio; el Prestador (`PROVIDER`) administra su único negocio y ofertas asignadas; el Administrador (`ADMIN`) usa Django para usuarios, carpetas, habilitaciones, reglas y auditoría. Son cuatro roles distintos. F1 se retiró tras la elección; el plan 08 adelanta exclusivamente los paneles operativos de la red.

## Paneles operativos del plan 08

`workspace/Workspace` aporta la shell verde y el menú móvil en flujo del documento, con navegación activa, objetivos de 44 px, foco visible y cuenta/salida. `/espacio` envía al inicio propio: `/prestador`, `/colaborador`, `/mi-viaje` o documento `/admin/`. Las rutas de ingreso y el catálogo público siguen accesibles con una sesión de red. Pedir una ruta del otro rol muestra una denegación sin iniciar sus APIs.

Prestador: `/prestador/negocio` edita la ficha e imagen permitidas; `/prestador/beneficios` lista, crea y edita ofertas, y elimina borradores con confirmación y conflicto legible. Nombre y categoría son informativos. Los totales derivan de estados del servidor; no se infiere vigencia con el reloj local. `/prestador/qr` consulta la credencial y PNG privados propios, descarga el QR y permite escribir un PIN de 6–12 dígitos. `/prestador/cuenta` muestra los datos de sesión.

Colaborador: `/colaborador/recomendaciones` usa `available` y `benefit:null` para representar selecciones retiradas sin mostrar contenido borrador. `/colaborador/catalogo` busca y pagina `/collaborator/catalog/benefits/` y agrega exclusivamente el beneficio elegido mediante PUT idempotente propio. Quitar usa DELETE de la misma selección. `/colaborador/qr` carga JSON y PNG privados actuales, permite descarga y copia explícita del enlace; `/colaborador/cuenta` muestra la sesión. Al volver al foco se limpian y revalidan las cargas; un 403 retira el contenido anterior.

El workspace se desmonta por identidad, versión de sesión y ruta. Las cargas se cancelan y verifican la versión; escrituras tardías no generan feedback en otra cuenta. `PrivatePhoto` es un componente neutral compartido con el Cliente y revoca URLs Blob incluso si terminan tras el desmontaje. El transporte multipart conserva el cliente de API seguro, su reintento con el mismo cuerpo, autenticación, cancelación y `no-store`. Las pruebas con respuestas simuladas cubren estas garantías; QA visual real y revisión independiente son responsabilidad de la integración del plan 08.
