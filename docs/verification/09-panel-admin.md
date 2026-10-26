# Verificación del panel administrativo React

Etapa autorizada el 24/10/2026: panel React completo y configuración del sitio; analíticas E6 y frontend de compra del Cliente quedan pendientes. Diseño y plan en `docs/superpowers/`.

## Base y aislamiento

- Rama `feature/panel-admin` desde `a584e99`, después de E5. GitHub confirmó PR #11 y #10 abiertos, sin fusionar, al inicio de la etapa. La nueva entrega depende de ambos.
- Se conservaron los cambios preexistentes de `CONTEXT.md` y `docs/resumen-conversacion-agentes.md`.
- Proyecto Docker `llaveextra-admin` con PostgreSQL y Redis propios; backend/ frontend construidos con los locks existentes. No se usó SQLite ni se cargaron semillas en la base principal.
- Preparación ejecutada: `docker compose -p llaveextra-admin up -d db redis`, `docker compose -p llaveextra-admin build backend` y `docker compose -p llaveextra-admin build frontend`, exit 0.
- QA HTTP/navegador reservado a puertos 8001/5174 mediante override local ignorado. Los datos, helpers y credenciales sintéticas de QA no se versionan.

## Comprobaciones de implementación

Implementación de servidor y React disponible. Las revisiones por tarea están aprobadas; quedan la revisión final de rama y su entrega. Este archivo todavía no declara cerrada la etapa.

Task 1, fundamentos/configuración: commit `8bfb3ab`, 29 focales y 242 pruebas completas PostgreSQL/Redis aprobadas; Ruff, drift y OpenAPI sin warnings. Revisión independiente detectó versión Unicode que producía 500: fix `576dc7c` valida formato HMAC antes de comparar; RED reprodujo dos fallos, GREEN pasó ocho casos y las 37 pruebas del grupo de configuración. Re-review focal aprobada: I1 resuelto, cumplimiento y calidad aprobados sin nuevos hallazgos.

QA HTTP real sobre el servidor aislado, después de migrar y cargar fixtures sintéticos: `docker compose -f compose.yaml -f work/admin-qa.compose.yaml -p llaveextra-admin exec -T backend python /qa/admin_http_qa.py`, exit 0. Comprueba JWT/CSRF reales, los cuatro grupos de configuración, DTO público limitado, rechazo a Cliente/Prestador/Colaborador, versión Unicode409 y no-store. La primera invocación inmediatamente tras restart encontró el servidor aún arrancando; repetir con servidor listo pasó. La carga sintética inicial fue revertida por falta de condiciones en el beneficio publicado; se corrigió el fixture y se cargó sin cambiar el producto.

## API operativa — Task 2

Implementación `fab4dfc`: trece recursos administrativos, comandos de dominio, medios/QR privados, bandejas operativas, auditoría e invitaciones con estado persistido. Suite backend completa **260 passed in 148.32s**, antes del último ajuste de esquema/prueba adicional; focal final **11 passed**. Ruff, drift y OpenAPI sin advertencias. Gate independiente aprobado después de las correcciones indicadas abajo; estos resultados todavía no cierran la etapa completa.

Migración `administration.0002` aplicada exclusivamente en QA, exit 0. QA HTTP real del controlador, mismo helper/prefijo documentado: exit 0 para los trece listados/detalles, dashboard, filtros malformados400, cambio de portada visible en el DTO público y restitución del texto original, stale409, delta de stock/replay/carga diferente409 y restitución del stock sintético, QR dedicado y rechazo por rol. No se imprimieron PIN, QR ni tokens.

## Revisión independiente de la API operativa

El gate detectó y corrigió tres puntos en `1740136`: la versión incluye credencial/membresías/selecciones, OpenAPI describe cuerpos/respuestas y cabeceras reales, y se agregaron carreras PostgreSQL frente a consumos/compras/cancelaciones. Las 16 pruebas del grupo de gestión, Ruff, drift y esquema pasaron. Una aserción no determinista de cancelación se corrigió en `6968456`, aceptando ambos intercalados válidos y comprobando stock, ajustes, pedido, saldo y reintegro único; las tres carreras y tres ejecuciones focales adicionales pasaron. Revisión focal final: cumplimiento y calidad aprobados, sin Critical/Important abiertos. La observación menor sobre tamaño de historiales anidados queda para la revisión final de rama.

Al retomar el 25/10/2026 se reinició Docker Desktop mediante su CLI y se recuperaron los contenedores existentes del proyecto aislado. Sobre `6968456`, `docker compose -p llaveextra-admin run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q` terminó con **266 passed in 356.65s**. Ruff, `makemigrations --check --dry-run` y `spectacular --validate --fail-on-warn` terminaron correctamente, sin cambios pendientes de modelos ni advertencias del contrato.

## Migraciones del entorno local principal

El 25/10/2026 se creó un respaldo PostgreSQL en formato custom antes de migrar. `pg_restore --list` pudo leer su índice; no se ensayó una restauración. El respaldo y los conteos quedaron en `work/`, ignorados por Git.

`docker compose run --rm --no-deps backend python manage.py migrate --noinput` aplicó `administration.0001` y `administration.0002`, exit 0. Los conteos antes y después coincidieron: 17 usuarios, 14 prestadores, 14 beneficios, 10 relaciones históricas de carpeta/prestador, 8 selecciones concretas, 6 consumos, 7 movimientos de saldo, 0 productos y 0 pedidos. No se cargaron semillas ni se modificaron cuentas o credenciales. Backend y frontend principales volvieron a arrancar en 8000/5173.

Decisión de implementación revisada: las versiones administrativas de prestadores y colaboradores incluyen las relaciones y credenciales relevantes, además de sus columnas. Esto protege acciones sobre una ficha desactualizada; puede exigir recargarla si otra operación modificó una relación. Las lecturas no toman locks de filas; las escrituras vuelven a comprobar el estado bajo los locks del dominio.

## Límites externos

Mercado Pago sigue sin sandbox externo validado. No se habilitan cobros, scheduler ni despliegue productivo. El proveedor de pagos no se puede cambiar desde la configuración del panel.

## Revisión preliminar del navegador

En QA aislado se ingresó por el formulario real con el administrador sintético: destino `/gestion`, dashboard con conteos y bandejas coincidentes con los fixtures, grupos de configuración y listado de prestadores. La presentación a 320 px muestra filtros y filas apiladas, con ancho de documento de 305 px para viewport de 320 px, sin desbordamiento horizontal global.

Cambiar el título de portada e intentar salir produjo el aviso de cambios sin guardar. La herramienta del navegador no pudo recuperar ese diálogo: `getJsDialog()` devolvió ausencia de diálogo y las acciones de foco/cierre agotaron el tiempo. En otra pestaña las lecturas y navegaciones directas funcionaron, pero los clics posteriores no confirmaron transiciones. Por ello esta pasada no acredita guardado por interfaz, aceptación/rechazo del aviso, menú móvil ni acciones operativas; se requiere evidencia automatizada y un intento posterior sobre el corte final. No se confirmó ningún cambio persistido por interfaz en esta pasada.

## React — Tarea 3

Primera revisión independiente de `272ae11`: cambios solicitados, 0 críticos, 7 importantes y 4 menores. Los importantes abarcan versión/base del formulario después de acciones, separación de comandos inciertos y recarga, seguimiento de invitaciones pendientes, precios con centavos, paginación de movimientos, quitar imágenes y etiquetas españolas de fichas. Se asignó una ronda conjunta al implementador. Los menores (filtros al volver atrás, título de documento tardío, salida tras eliminar regla y cancelación de edición) se conservan para revisión final.

Implementación `272ae11`: panel de gestión, trece recursos, acciones, búsquedas por nombre para relaciones, configuración y consumidores públicos. La autorrevisión corrigió etiquetas técnicas visibles, respuestas tardías de sesión/ruta, liberación de blobs y una doble confirmación en navegación interna.

Resultados del implementador sobre ese corte: `pnpm exec vitest run src/product/admin/AdminWorkspace.test.tsx` **7/7**; `pnpm test` **85/85 Vitest y 1/1 proxy**; `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` y comprobación del diff correctos, sin advertencias. Los casos focales verifican conflicto sin pérdida de texto, reintento con igual carga/clave, selector por nombre, destino de Administrador, cierre por revocación, protección de navegación/foco y configuración pública. Gate independiente iniciado; resultados pendientes.

La lectura del formulario real de alta de beneficio en QA confirmó el selector de prestador por nombre y campos de contenido, condiciones, fechas, imagen y publicación. La comprobación de guardado por navegador mantiene la limitación indicada arriba.

Corrección `2c4f40c`: los siete hallazgos importantes quedaron resueltos y aprobados por revisión focal independiente, sin críticos ni importantes abiertos. Se añadieron 15 regresiones en `AdminRecovery.test.tsx`. Verificación en Docker: `docker compose -p llaveextra-admin run --rm --no-deps frontend pnpm exec vitest run src/product/admin/AdminRecovery.test.tsx --maxWorkers=1` **15/15**; `docker compose -p llaveextra-admin run --rm --no-deps frontend pnpm test --maxWorkers=1` **100/100 interfaz y 1/1 proxy**, nueve archivos y 66.26 s de Vitest; lint, tipos y build correctos, sin advertencias. El arranque de un worker nativo agotó el tiempo bajo lentitud del host; los gates completos se cerraron en Docker. Una respuesta simulada incompleta de un selector se corrigió en el arnés antes de esos resultados.

La revisión focal conserva cinco observaciones menores para la revisión de rama: filtros al navegar atrás, título del documento después de configuración tardía, salida tras quitar una regla, Cancelar dentro de una edición y nombre accesible del selector de archivo. También se comprobará la presentación de errores de validación por campo y la observación previa de historiales anidados en listados del servidor.

Para complementar ese bloqueo se ejecutó un arnés temporal de componentes con jsdom y **API HTTP real**, autenticado contra el backend aislado; no simula respuestas de `fetch`. `pnpm exec vitest run --config work/admin-real-api.vitest.ts`, desde frontend con los dos archivos temporales presentes allí, pasó **4/4**: guardar General y comprobar DTO público, editar el nombre de un Cliente sintético sin cambiar email/rol, enviar delta de stock con motivo y cambiar el menú entre expandido/contraído mientras carga el listado real. Los valores de configuración, nombre y stock se restituyeron en `finally`. Los primeros intentos corrigieron únicamente el arnés (resolución del archivo de credenciales y lectura de `/auth/me/`); no detectaron errores de producto. Los archivos se conservaron en `work/` ignorado, fuera del frontend, para no incorporarlos al lint o build. Esta evidencia de componentes integrados no acredita clics de navegador nativo ni operaciones externas.

Sobre `2c4f40c` se repitió ese arnés en Docker con un quinto caso: precio `12.50` válido por HTML, guardado real, respuesta decimal del servidor y créditos preservados. Resultado **5/5 en 9.02 s**. Comando: `docker compose -f compose.yaml -f work/admin-qa.compose.yaml -f work/admin-integration.compose.yaml -p llaveextra-admin run --rm --no-deps -e ADMIN_QA_BASE=http://backend:8000 -e ADMIN_QA_CREDENTIALS=/qa/admin-qa-credentials.local.json frontend pnpm exec vitest run --config work/admin-real-api.vitest.ts --maxWorkers=1`. El primer intento Docker no encontró el arnés, porque el Compose habitual monta solo `src/`; se agregaron los montajes locales de solo lectura y el intento completo pasó. Se restituyeron configuración, nombre, stock y precio. No se montaron `node_modules` del host ni datos principales en estas pruebas.
