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

Repetición del caso original por Nginx con `78df20a`: HTTP 400 en los tres filtros, con el campo rechazado comprobado en la regresión de PostgreSQL.

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

GREEN de SEC-002, SEC-005 y SEC-006 con PostgreSQL y Redis aislados. `python -m pytest --ds=config.settings.test -q accounts/tests/test_auth_api.py accounts/tests/test_reset_password.py providers/tests/test_public_catalog_inputs.py providers/tests/test_featured.py` → 57 passed. Ruff focal aprobó. Revisión estática independiente por `gpt-6-luna` (high) sin bloqueantes. La repetición independiente en ejecución queda pendiente.

- SEC-001 `6490060`: 74 pruebas focales de API/sesión/consumidores React y, después de ajustar el fixture TypeScript, 19 pruebas de API. Lint, tipos y build aprobaron. La revisión independiente de código aprobó las comparaciones de cuenta/SID y la invalidación local sin revocar otra sesión.
- SEC-003 `eb97132`: 39 pruebas de autenticación en PostgreSQL/Redis, incluidas las variantes de cookie ajena, bearer válido/vencido y cookie malformada. La revisión detectó SEC-008, que requiere verificar generación y revocación de la cookie usada como autoridad.
- SEC-004 `d4b1531`: 43 pruebas en cuentas y referencias, más Ruff/OpenAPI y revisión independiente de código. Se probaron límites por origen/cuenta y Redis inoperante sin altas, tokens ni correos.
- CAS-A04-002 y CAS-T05-001: un par de pruebas sintéticas en PostgreSQL reprodujo la vigencia de enlaces previos a un cambio de email y la restauración de un bearer tras reactivación en Django Admin. Se registran SEC-009 y SEC-010.
- CAS-T04-004 y CAS-T04-005 reprodujeron SEC-008 con refresh rotado, sin bearer o con bearer vencido. Con `783da70`, ambos devuelven 401 y la cookie vigente sigue rotando. Pasaron las ocho pruebas de logout, Ruff y la revisión estática independiente.
- Con SEC-009 `0173874`, cambiar el email con CSRF efectivo en Django Admin deja la nueva dirección sin verificar, rechaza enlaces de verificación y reset previos y revoca el bearer anterior. Rechaza emitir enlaces con una instancia que conserva la dirección anterior y admite verificar con un enlace nuevo. Pasó la regresión PostgreSQL y la revisión estática independiente.
- SEC-010 `b1108cb` conserva revocadas las sesiones emitidas antes de desactivar y reactivar. Un login nuevo tras reactivar funciona. RED/GREEN en PostgreSQL y Ruff focal. El revisor halló una carrera distinta, SEC-013.
- En CAS-A08-001, el código previo a SEC-013 devolvió 200 cuando la desactivación se confirmó mientras esperaba el login. La sincronización observa la autenticación previa o el bloqueo efectivo de la conexión PostgreSQL. Con `6077439`, la solicitud devolvió 401 y no creó sesión. Ruff y la revisión estática aprobaron.
- El revisor independiente reejecutó `test_logout.py`, `test_account_email_change.py` y `test_login_deactivation.py` con el lock final y una instancia separada de PostgreSQL/Redis de prueba. Pasaron 10 casos de SEC-003, SEC-008, SEC-009 y SEC-013.
- La segunda revisión ejecutó `test_admin_identity.py`, `test_reset_password.py`, `test_register_rate_limit.py`, `test_public_catalog_inputs.py` y `test_providers.py` con PostgreSQL/Redis. Pasaron 24 casos.
- En CAS-A05-002, una ficha de Django Admin leída antes de un reset conservaba el hash viejo. Tras un reset HTTP 200 con confirmación del nuevo hash, guardar el cambio de nombre con esa instancia restauró la contraseña anterior. La prueba RED de SEC-014 falló al verificar la contraseña nueva.
- En `71e5e54`, la edición preserva el hash vigente y guarda el cambio de perfil. La contraseña anterior sigue rechazada. Pasaron cinco pruebas de cambio de contraseña y Django Admin, con cobertura de la ruta técnica dedicada. Ruff y la revisión estática independiente aprobaron.
- La reejecución independiente de `test_admin_concurrent_password.py` aprobó los dos casos de SEC-014 en PostgreSQL/Redis.
- La revisión independiente final de autenticación aprobó 33 casos de `test_auth_api.py` y 19 casos de `src/product/api.test.tsx` para SEC-005 y SEC-001.

## Autorización por objeto

El smoke por Nginx, con sesiones sintéticas y CSRF real, obtuvo los estados esperados en 20 comprobaciones. Cubrió login e inactividad, `/auth/me/`, redención QR, carpeta propia y ajena, imagen privada propia con `no-store`, negocio propio y ajeno, y diferencia entre ADMIN parcial (403) y completo (200).

CAS-M01-002 amplió la cobertura a 59 rutas de API administrativa en Django con 521 aserciones HTTP. Se comprobaron los métodos declarados con anónimo, ADMIN sin staff, ADMIN sin superusuario, Cliente con staff, Prestador y Colaborador, más TRACE con ADMIN completo. Los conteos de usuarios, prestadores, beneficios, productos, pedidos y auditorías se conservaron. El adaptador de Django Admin con sesión se evalúa por separado.

| ID | Condición sintética | Esperado | Observado inicial |
| --- | --- | --- | --- |
| CAS-P01-001 | PATCH del negocio mientras otra conexión revoca la membresía | 404 y descripción original | 200, SEC-007 |
| CAS-P01-002 | PATCH de la oferta mientras otra conexión revoca la membresía | 404 y título/publicación originales | 200, SEC-007 |
| CAS-P01-003 | POST de oferta mientras otra conexión revoca la membresía | 404 y sin alta | 201, SEC-007 |

La prueba usa dos conexiones PostgreSQL. La transacción de baja retiene los locks y confirma al observar que la solicitud está bloqueada mediante `pg_blocking_pids`. Los tres casos fallaron contra el código inicial por los estados HTTP registrados.

GREEN de SEC-007 `49efef7`: `python -m pytest --ds=config.settings.test --reuse-db -q providers/tests/test_providers.py` → 15 passed. Ruff focal y revisión estática independiente aprobaron.

## Dependencias e infraestructura

- Para SEC-011 `b2e9402`, `uv lock --upgrade-package Pillow` cambió Pillow 11.3.0 → 13.0.0. `uv sync --locked --all-groups` en un entorno aislado y 16 pruebas de medios privados/públicos, validación de imágenes y QR pasaron. `uv audit --locked` solo dejó dos identificadores del mismo aviso de pytest.
- Para SEC-012 `5342110`, `uv lock --upgrade-package pytest` cambió pytest 8.4.2 → 9.0.3. Tras instalar el lock con `uv sync --locked --all-groups`, `uv audit --locked` devolvió código 0 y cero avisos conocidos en 30 paquetes, incluido el grupo de desarrollo.
- Un revisor independiente reejecutó `uv audit --locked` con el lock final y reprodujo el resultado en los 30 paquetes.
- `pnpm audit --audit-level moderate` devolvió código 0. El test de configuración del proxy pasó. Se ejecutaron seis pruebas de guardas de producción con claves sintéticas. Una búsqueda acotada de patrones de secretos en la historia auditada no produjo coincidencias; queda pendiente un escaneo integral.
- Con el lock final pasaron Ruff, `manage.py check`, la validación OpenAPI con `--fail-on-warn` y la detección de cambios de migración. `manage.py check --deploy --settings=config.settings.prod` devolvió código 0 con `security.W005` y `security.W021` por HSTS para subdominios y preload.
- Las 44 pruebas focales con pytest 9.0.3 y PostgreSQL/Redis incluyeron cambio de correo, desactivación y reactivación, autenticación, logout y matriz administrativa. El test de logout conserva el refresh vigente como cadena antes de asignar temporalmente el anterior. Así evita modificar el objeto de cookie que Django comparte con la respuesta.

## Frontend

En el corte con SEC-001, `pnpm run test` obtuvo 374 aprobadas y una falla en `src/product/QrFlow.test.tsx:50`. La misma falla se reprodujo al ejecutar esa prueba en la imagen original de `develop` sin montar código local. Las pruebas focales de sesión aprobaron, junto con lint, tipos y build. Queda pendiente revisar el comportamiento en dos pestañas de un navegador real.

La repetición aislada de `QrFlow.test.tsx` con `--maxWorkers=1 --testTimeout=30000` aprobó 35 casos y falló al buscar el encabezado de la selección contextual. La interfaz llegó a mostrar el Cliente autenticado y el formulario de QR. La causa no quedó confirmada.

## Reservas y pagos simulados

Se reconstruyó la imagen Docker de backend en el corte `71e5e54` y se comprobaron Pillow 13.0.0 y pytest 9.0.3 desde esa imagen. `python -m pytest --ds=config.settings.test --reuse-db -q shop/tests/test_payments.py shop/tests/test_reservations.py` aprobó 72 casos en PostgreSQL y Redis.

- S06–S08. Reservas impagas con y sin ID remoto, vencimiento y cancelación, pago tardío, confirmación monotónica y stock retenido con refund pendiente.
- S09–S12. Firma y deduplicación de webhook, conciliación con GET, datos ajenos rechazados, recuperación de CREATE incierto y fencing entre workers.
- S13–S14. Refund sin confirmación retiene inventario, refund tras retiro queda como incidencia y la configuración deshabilitada bloquea el worker de pagos.

Las pruebas ejercitan el contrato del adaptador con respuestas simuladas. La interoperabilidad externa S15 sigue bloqueada.

## Regresión integrada

La suite completa `python -m pytest --ds=config.settings.test --reuse-db -q` aprobó 452 casos en PostgreSQL/Redis con Pillow 13.0.0 y pytest 9.0.3. Arrancó sobre `750191d`, antes de SEC-014. Los cinco casos focales y los dos casos reejecutados por el revisor cubrieron el último cambio en `71e5e54`. La colección en ese último commit enumeró 454 casos.

| Área | Evidencia de la suite integrada |
| --- | --- |
| Cuentas y sesiones | `accounts/tests/test_auth_api.py`, `test_reset_password.py` y `test_logout.py` cubren registro sin escalada, mensajes de recuperación, CSRF, tokens vencidos/revocados y rotación concurrente. |
| QR, carpetas y catálogo | `referrals/tests/test_qr_credentials.py` y los módulos `providers/tests/test_folder_selection.py`, `test_recommendations.py`, `test_catalog.py` y `test_providers.py` cubren rotación, selección canónica, permisos de perfil/prestador y políticas pública y privada. |
| Consumos y créditos | `credits/tests/test_credits.py` cubre consumo directo y referido, QR/PIN, idempotencia, créditos únicos bajo concurrencia, anulación, ajustes y restricciones PostgreSQL. |
| Tienda | `shop/tests/test_shop.py`, `test_catalog_admin.py`, `test_payments.py` y `test_reservations.py` cubren titularidad, precios, inventario concurrente, estados y recuperación mediante el adaptador simulado. |
| Administración | `administration/tests/test_settings.py`, `test_management.py` y `test_security_matrix.py` cubren permisos, versiones, efectos y auditoría atómicos, intentos de escritura financiera y comandos idempotentes. |

Las familias marcadas parcialmente verificadas en el checklist tienen evidencia de una o más variantes. La regresión integrada no sustituye la matriz completa por ruta, rol y objeto.

Se recreó el backend del laboratorio con la imagen final y se reinició su Nginx. Salud respondió HTTP 200 en el backend directo. Las 20 comprobaciones del smoke HTTP por Nginx repitieron los estados esperados y el medio privado conservó `Cache-Control: no-store`.

## Continuación del 06/11/2026

Se retomó el corte `5e90b72` en el mismo laboratorio. Edge se abrió en un contexto desechable con Playwright Core 1.58.2. Las pruebas limitaron las solicitudes reales al loopback e interceptaron la carga de fuentes externas. Los marcadores, las contraseñas y los tokens sintéticos se mantuvieron fuera del registro.

| Caso | Comprobación y resultado |
| --- | --- |
| CAS-T07-001 | Con Cliente autenticado, Edge eliminó el fragmento de un QR real del laboratorio. La URL y el referrer quedaron sin el QR. El almacenamiento local quedó vacío y el almacenamiento por pestaña conservó solo la pista permitida, con IDs de cuenta y colaborador. La cookie de refresh tenía HttpOnly y el access usado en el login no apareció en el almacenamiento. La búsqueda de 15 contraseñas o QR sintéticos dio cero coincidencias exactas en logs recientes y JavaScript compilado. |
| CAS-T08-003 | Dos pestañas en el mismo contexto de Edge iniciaron sesión con cuentas Cliente diferentes. Tras revocar la primera sesión por API, el GET de billetera devolvió 401 y el refresh compartido devolvió 200. La primera pestaña retiró su identidad y no adoptó la segunda. La segunda conservó acceso a `/auth/me/`. |
| CAS-F01-001 | La prueba DOM del pie muestra contenido semejante a HTML como texto literal, sin insertar un nodo con handler. La suite independiente de configuración aprobó 37 pruebas en PostgreSQL/Redis. Nueve variantes inválidas de la configuración devolvieron 400 sin reflejar el valor ni persistir datos. |
| CAS-F06-001 | SEC-015. Django acepta direcciones con `?`, `#` y `%` en la parte local. El enlace anterior interpretó el primero como parámetros, el segundo como fragmento y el tercero como codificación. Con `e1a4dd7`, las regresiones preservan una sola dirección, incluido un alias con `+` y una parte local entre comillas con `@`. La reejecución independiente de `Layout.test.tsx` aprobó seis pruebas. [RFC 6068](https://www.rfc-editor.org/rfc/rfc6068.html) |
| CAS-F02-001 | Nginx aprobó 57 comprobaciones, con 21 de autenticación y 36 de alcance, usando siete cuentas sintéticas y solicitudes anónimas. Se verificaron Prestador titular y ajeno, Colaborador propio, ajeno y deshabilitado, Cliente con y sin concesión, y ADMIN completo, parcial y otros roles. El navegador abrió directamente `/gestion/beneficios` como Cliente y la API administrativa devolvió 403. Queda pendiente extender navegación en navegador a todos los roles y la matriz de escritura por objeto. |
| CAS-F05-004–010 | SEC-016. Un NUL devolvía 500 en los filtros `search` y `category` del catálogo del Colaborador, en `search`, `action` y `resource` de actividad administrativa y en `search` y `status` de colecciones administrativas. RED reproducido en PostgreSQL. Los dos casos del Colaborador también se observaron por Nginx. El segundo login ADMIN recibió 429, por lo que los casos administrativos se comprobaron con APIClient autenticado. |
| CAS-P01-004 | SEC-017 `ae908bb`. Dos conexiones PostgreSQL comprobaron el bloqueo con `pg_blocking_pids`. Antes del fix, el PUT devolvía 200 y cambiaba el hash después de confirmar la baja de la membresía. Después devuelve 404 y el hash se conserva. Pasaron 23 pruebas de créditos, Ruff y OpenAPI. |
| CAS-F04-001–002 | SEC-018. En el build anterior, Vite iniciaba la solicitud de Google Fonts desde CSS antes de limpiar el fragmento en `/referencia` y `/consumo`, con 800 ms de demora simulada del JS. No apareció el marcador en red o consola. En el build corregido, Edge observó cero solicitudes externas antes de la limpieza y cero encabezados Referer en la solicitud inicial de fuentes. Las familias, los pesos y `display=swap` se conservan. |

La prueba de redención automática bajo StrictMode que falló el 05/11 pasó de forma aislada y dentro de una suite de 381 pruebas de frontend. Otra corrida focal mostró una falla intermitente de foco al cambiar de página, reproducida con el código anterior de `Layout.tsx`. El control de acceso y la desaparición de la página anterior permanecieron efectivos en ese caso.

El lote de SEC-016 aprobado tras `859e94d` incluyó `config/tests/test_private_query_inputs.py`, `providers/tests/test_public_catalog_inputs.py`, `providers/tests/test_recommendations.py`, `administration/tests/test_management.py` y `administration/tests/test_security_matrix.py`. Pasaron 42 pruebas. La corrida previa expuso que una prueba de recomendaciones daba por existente la fila del interruptor de catálogo en una base reutilizada. `2c21145` prepara esa fila en el propio caso. La reejecución independiente de SEC-016 y SEC-017 aprobó ocho pruebas.

En SEC-018 pasaron dos pruebas nuevas de `src/main.test.tsx` en Docker, también reejecutadas por un revisor independiente. Se comprobó el artefacto integrado con `node work/security/browser-harness/qr-prod-preview.cjs f04-static-integrated --expect-clean-first` sobre loopback. El harness retrasa la carga del JS, registra el orden relativo de `history.replaceState` y la solicitud de fuentes, e intercepta las salidas externas.

La repetición integrada de CAS-T07-001 y CAS-T08-003 agregó una entrada de PIN sintético en `/consumo`, sin enviar el formulario. El PIN quedó fuera de URL, Referer y almacenamiento. El escaneo de valores completos incluyó contraseñas, QR, el PIN ingresado y access emitidos durante los dos logins. No encontró coincidencias en los logs recientes ni en el JavaScript compilado.

En CAS-F06-002 se inició sesión técnica con una cuenta sintética en dos contextos nuevos. Django Admin devolvió 302 al mismo origen ante un `next` HTTPS externo y otro que empezaba con `//`. Edge bloqueó toda solicitud externa de la prueba.

En el corte de frontend con `5793a59` pasaron `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` y `pnpm run test --maxWorkers=2 --testTimeout=30000 --reporter=dot --no-color`. Resultado de la suite final: 383 Vitest en 33 archivos y una prueba de proxy, incluidos los casos de redención bajo StrictMode y foco al paginar.

Sobre `859e94d`, `python -m pytest --ds=config.settings.test --reuse-db -q` aprobó 462 casos en 385,84 s, con una base PostgreSQL nueva de pytest y Redis aislado. También aprobaron `ruff check .`, `manage.py check`, `makemigrations --check --dry-run` sobre la base existente del laboratorio y `spectacular --validate --fail-on-warn`.

## Configuración y dependencias

- Seis verificaciones en procesos Python aislados aprobaron. La configuración de producción rechazó ausencia o reutilización de claves, falta de hosts y adaptador fake. Con configuración válida mantuvo DEBUG apagado, redirección HTTPS, cookies Secure y HSTS configurados. Esta comprobación evalúa settings locales.
- Registro por Nginx con cuenta sintética y CSRF: 201. Se confirmó un mensaje para el alias en la API de Mailpit sin registrar destinatario ni enlace.
- `pnpm run test:proxy` → 1 passed. `pnpm audit --audit-level moderate` → exit 0, sin avisos del feed consultado.
- `uv audit --locked` → exit 1. El feed reportó 93 entradas para Pillow 11.3.0 y 2 entradas para pytest 8.4.2, que incluyen identificadores alternativos. Se registraron SEC-011 y SEC-012.
- Búsqueda acotada en archivos seguidos y en la historia del corte por archivos de entorno/medios, cabeceras de claves privadas y patrón de token de pagos. Sin coincidencias para esos patrones. El escaneo integral de secretos y contenedores sigue pendiente.

## Suite de interfaz

`pnpm exec vitest run --maxWorkers=2 --testTimeout=20000 --reporter=dot` → 374 passed, 1 failed. El caso falla al esperar la selección contextual en `QrFlow.test.tsx:50`. El mismo fallo se reprodujo al ejecutar ese caso sobre la imagen original de `7467838`, en un contenedor sin red y sin montar los archivos modificados. Los casos focales de SEC-001 sí pasaron en el árbol corregido.
