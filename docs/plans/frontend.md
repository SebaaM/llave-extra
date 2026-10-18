# F1 · Tres prototipos de frontend

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

El servicio demo sigue sin estar conectado: la implementación funcional debe usar el contrato OpenAPI de E2–E6. El servidor autoriza cada listado y detalle por QR válido, colaborador habilitado y pertenencia del prestador a la carpeta; controla email verificado, unicidad de consumos, créditos, stock e idempotencia. Los tipos del mock son una propuesta visual y no sustituyen el contrato OpenAPI.

## Dirección elegida y siguientes entregas

El usuario eligió **Beneficios** para la portada y el enfoque **Pasaporte** para Mi viaje el 18-10-2026. La tarea F2 comienza después de E6 y desarrollará el recorrido funcional del Cliente, conectando autenticación, QR, beneficios, consumos y progreso a las APIs reales. La portada explicará el valor para turistas y cómo funciona, sin afirmar descuentos ni acuerdos comerciales no confirmados.

F3 sigue a F2 y cubre tienda, pedidos y espacios separados de Colaborador, Prestador y Administrador. Cada área respetará los permisos del servidor y el backoffice existente.

## Verificación

Los comandos y resultados históricos de F1 se conservan en `docs/frontend-prototipos.md`; la migración actual de uv/pnpm se documenta en el informe Task 8. Los futuros reportes F2/F3 distinguirán verificaciones mock de flujos comprobados contra servidor.
## Espacios de acceso y permisos previstos

La experiencia principal del producto corresponde al Cliente (`TOURIST`): consulta beneficios autorizados tras acceder por QR, gestiona su perfil, progreso, créditos, compras y canjes. El Colaborador (`COLLABORATOR`) tendrá su espacio para consultar su carpeta y referencias habilitadas; el Prestador (`PROVIDER`) administrará solo su propuesta y ofertas asignadas; el Administrador (`ADMIN`) tendrá el backoffice para usuarios, carpetas, habilitaciones, reglas y auditoría. Son cuatro roles distintos. F1 mantiene los tres prototipos demo y no implementa esos espacios de gestión; la dirección seleccionada guía el futuro F2.
