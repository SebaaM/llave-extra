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

La API de E2–E5 deberá reemplazar el servicio demo después de la elección. El servidor tendrá que autorizar cada listado y detalle por QR válido, colaborador habilitado y pertenencia del prestador a la carpeta; controlar email verificado, unicidad de consumos, créditos, stock e idempotencia. Los tipos del mock son una propuesta visual y no sustituyen el contrato OpenAPI.

## Gate de decisión

**Elegir una opción** (Guía local, Pasaporte o Beneficios) antes de implementar el frontend definitivo y conectarlo con JWT y la API. La elección puede combinar rasgos concretos de otras opciones si el usuario lo indica. No hay elección implícita en esta entrega.

## Verificación

Los comandos, resultados, auditoría de dependencias y evidencia visual real se registran en `docs/frontend-prototipos.md` y en el informe SDD de la tarea.
## Espacios de acceso y permisos previstos

La experiencia principal del producto corresponde al Cliente (`TOURIST`): consulta beneficios autorizados tras acceder por QR, gestiona su perfil, progreso, créditos, compras y canjes. El Colaborador (`COLLABORATOR`) tendrá su espacio para consultar su carpeta y referencias habilitadas; el Prestador (`PROVIDER`) administrará solo su propuesta y ofertas asignadas; el Administrador (`ADMIN`) tendrá el backoffice para usuarios, carpetas, habilitaciones, reglas y auditoría. Son cuatro roles distintos. Esta integración mantiene los tres prototipos demo y no implementa esos espacios de gestión ni selecciona una variante.
