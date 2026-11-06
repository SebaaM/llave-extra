# Casos ejecutados y evidencia del corte 7467838

## HTTP público

Pruebas con `curl` por backend directo (8002) y Nginx (8082), con una conexión y al menos 550 ms entre solicitudes. Se descartaron los cuerpos que contenían páginas de error de desarrollo.

| ID | Actor y operación | Esperado | Observado |
| --- | --- | --- | --- |
| CAS-B05-001 | Anónimo GET salud, directo y proxy | 200 | 200 en ambos |
| CAS-M03-001 | Anónimo GET configuración pública | 200 | 200. La verificación de llaves del DTO sigue pendiente |
| CAS-M01-001 | Anónimo GET dashboard Admin | 401 | 401 |
| CAS-S01-001 | Anónimo GET pedidos | 401 | 401 |
| CAS-F05-001 | Anónimo GET listado de productos, búsqueda con NUL | 400 controlado | 500, SEC-002 |
| CAS-F05-002 | Anónimo GET catálogo de beneficios, búsqueda con NUL | 400 controlado | 500, SEC-002 |
| CAS-F05-003 | Anónimo GET catálogo de beneficios, categoría con NUL | 400 controlado | 500, SEC-002 |

## Sesión y entradas

El auditor usó pruebas focales Django APIClient con CSRF y PostgreSQL del laboratorio. El lote de reproducción devolvió 18 passed. Los asserts reprodujeron el comportamiento observado, que se registra como FAIL del control. Las credenciales y tokens fueron sintéticos y se omitieron.

| ID | Condición sintética | Resultado y efecto | Hallazgo |
| --- | --- | --- | --- |
| CAS-T08-001 | Módulo frontend real, dos instancias y cookie compartida. Un 401 de una pestaña se renueva con otra cuenta o con otro SID del mismo titular | 2 casos reproducidos con `node --test`. La pestaña conserva su generación y muestra la respuesta privada de la otra sesión | SEC-001 |
| CAS-T04-001 | POST logout, Bearer vencido y refresh válido | 401. La cookie sigue vigente y el refresh posterior devuelve 200 | SEC-003 |
| CAS-T04-002 | POST logout, Bearer y refresh de sesiones diferentes | 204. Revoca la sesión de la cookie y conserva el Bearer original válido. Reproducido con titulares distintos y con dos SID del mismo titular | SEC-003 |
| CAS-T04-003 | POST logout, Bearer válido y cookie inválida | 204. La sesión del Bearer sigue activa | SEC-003 |
| CAS-A07-001 | POST registro desde un origen con emails sintéticos distintos, Redis inoperante en el proceso de prueba | 11 respuestas 201, 11 altas, 11 tokens y 11 envíos al backend de correo de pruebas | SEC-004 |
| CAS-A10-001 | JSON número o lista con un objeto en seis POST de cuenta | 500 reproducible sin altas, tokens ni sesiones nuevas | SEC-005 |
| CAS-A05-001 | POST reset con token vigente y contraseña similar al email | 500. El hash no cambia y el token permanece utilizable | SEC-006 |
