# Verificación — E6.1: visitas atribuidas

Entrega local sobre `develop` `7bb1a75`. Alcance: [diseño y etapas](../plans/06-analitica-salida.md). Incluye el informe administrativo y sus pruebas; no incluye E6.2–E6.4, compra/canje, migraciones de datos ni despliegue. Los datos de las comprobaciones fueron sintéticos.

## Funcionalidad verificada

- `GET /api/v1/admin/analytics/visits/` usa los permisos administrativos existentes y `Cache-Control: no-store`. Calcula por separado clientes únicos vinculados y visitas válidas atribuidas, con fechas civiles de Ushuaia. No devuelve identidades de Clientes, credenciales ni registros privados.
- Una carga DEMO concurrente no puede dejar al recuento en una vista diferente de la marca de procedencia: ambos se evalúan en una sola sentencia PostgreSQL. Si un período incluye vínculos heredados sin procedencia comprobable, la métrica correspondiente es no disponible; no se muestra como cero ni se bloquea el informe de visitas verificables.
- En `/gestion/analitica/visitas`, los filtros aplicados quedan en la URL. La búsqueda del selector conserva la selección pendiente, restablecer limpia el borrador incluso sin cambio de URL y la paginación mantiene filtros, totales y foco. El panel explica que los dos indicadores no miden conversión y oculta los datos si se revoca el acceso.

## Resultados

| Comprobación | Resultado |
|---|---|
| PostgreSQL/Redis: `python -m pytest -q` en Compose aislado `llaveextra-e6`, revisión `d471a44` | 542 pruebas aprobadas. La API tiene 19 casos focales sobre PostgreSQL. |
| Volumen sintético: 30→300 Clientes, 90→900 visitas, 30 comercios | Seis consultas por solicitud en ambos cortes; página 2 con cinco comercios. `EXPLAIN ANALYZE` del desglose: 2,418 ms en este laboratorio. No se agregaron índices ni se infirió rendimiento en producción. |
| `ruff check .`, `manage.py check`, `makemigrations --check --dry-run`, `spectacular --validate --fail-on-warn` | Aprobados; sin cambios de migración ni advertencias de OpenAPI. |
| `node node_modules/vitest/vitest.mjs run --configLoader runner --maxWorkers 4 --reporter dot`, `2db298c` | 435 pruebas aprobadas en 40 archivos. La primera corrida del panel tuvo un fallo de sesión que pasó aislado en la base y el candidato y no reapareció en la corrida final. |
| `node node_modules/eslint/bin/eslint.js .`, `node node_modules/typescript/bin/tsc -b --pretty`, `node node_modules/vite/bin/vite.js build --configLoader runner` | Aprobados en el candidato corregido. El chequeo de tipos requirió permiso local para escribir la caché de TypeScript de las dependencias ya instaladas. |
| `node --test tests/proxy-config.test.mjs` | Una prueba aprobada; el cambio no altera el proxy. |
| Navegador integrado en localhost · 1440, 390 y 320 px | Reinicio aun con la misma URL; el colaborador pendiente permanece seleccionado aunque la búsqueda no devuelva resultados; Enter pagina, mantiene cifras y enfoca la navegación; dos encabezados visibles y sin desborde horizontal del documento en móvil. Se corrigió y volvió a medir el solapamiento del buscador en escritorio. |

Los comandos backend se ejecutaron con `DJANGO_SETTINGS_MODULE=config.settings.test` en Compose, sobre PostgreSQL y Redis aislados. La prueba visual interceptó las APIs con registros sintéticos: no acredita QA con dispositivos físicos, pagos externos ni un despliegue real.

## Corte local

- API `5dcfb18`, corrección de procedencia `d471a44`.
- Panel `f0b0ac7`, corrección de filtros y foco `2db298c`.
- Revertir los commits del corte elimina el informe y su contrato nuevo sin revertir datos ni cambiar reglas de QR, créditos o tienda.

## Ajuste visual del informe — 17/11/2026

Pedido: pulir la sección, ordenar sus filtros y ubicar el cambio de página junto a la lista. Se conserva la identidad del panel y el contrato API. Desde, Hasta y Colaborador comparten la primera fila en escritorio; búsqueda y acciones quedan debajo. En móvil los campos se apilan. La tabla conserva ambas columnas sin desplazamiento horizontal y alinea las cantidades a la derecha. La navegación de comercios está agrupada semánticamente al pie de su lista; la navegación independiente del selector de colaboradores solo aparece si tiene varias páginas.

La revisión independiente detectó pérdida de foco al desmontar temporalmente la paginación del selector. Se agregó una regresión que falló con el foco en body, se restauró el foco al selector al terminar la carga y la revisión focal confirmó la corrección.

| Comprobación del ajuste | Resultado |
|---|---|
| Regresiones de agrupación y página única, antes del cambio | RED: dos pruebas nuevas fallaron, diez existentes aprobaron. |
| Archivo focal: `node node_modules/vitest/vitest.mjs run src/product/admin/VisitAnalyticsPage.test.tsx --configLoader runner --reporter dot` | Doce pruebas aprobadas, incluida la regresión de foco corregida. |
| Suite final: `node node_modules/vitest/vitest.mjs run --configLoader runner --maxWorkers 4 --reporter dot` | 437 pruebas aprobadas en 40 archivos. JSDOM emite su aviso conocido de navegación no implementada; ninguna prueba falló. |
| `node node_modules/eslint/bin/eslint.js .`, `node node_modules/typescript/bin/tsc -b --pretty` | Aprobados. |
| `node --test tests/proxy-config.test.mjs` | Una prueba aprobada; proxy sin cambios. |
| `node node_modules/vite/bin/vite.js build --configLoader runner --outDir ../.superpowers/sdd/06-analitica-salida/site` | Aprobado. Salida local ignorada para servir el ajuste en la demo existente; advertencia informativa por salida fuera de frontend. |
| Navegador integrado contra la API real y PostgreSQL sintético de localhost:8086 | Inspección visual en anchos CSS de 320, 390 y 1440 px; geometría adicional a 800 px. Sin desborde horizontal del documento ni de la tabla. Filtro por colaborador: 2 clientes/2 visitas; período sin actividad: 0/0; restablecer: 3/3 y dos comercios. Entrada de fechas comprobada con teclado. |

La demo contiene dos comercios con visitas válidas: la paginación de comercios, que requiere más de 25, se comprobó mediante las pruebas de varias páginas, no cargando más datos. La revisión inicial de código y el reexamen del foco fueron independientes; el navegador y las pruebas de ejecución fueron comprobados por el orquestador. No se repitió el backend porque el ajuste no modifica Python, permisos, datos ni OpenAPI; su evidencia anterior sigue separada arriba. No se modificaron archivos versionados de .superpowers ni se incluyeron accesos o datos locales en la entrega.

## E6.2 T3 — Métricas del Prestador

Implementación local en `feature/e6-etapas-pendientes` sobre `72985b9`. El resumen de `/prestador` agrega visitas directas y referidas del negocio asignado. Las cifras son independientes del flujo de comisiones. La API no acepta un ID de negocio para seleccionar otro, comprueba la titularidad y devuelve solo agregados. Los beneficios usan su título guardado al consumir; no se pierde el historial al cambiar la publicación.

| Comprobación | Resultado |
|---|---|
| RED de `analytics/tests/test_provider_metrics.py` y `ProviderMetrics.test.tsx` | El endpoint sin montar y el componente sin implementar fallaron como se esperaba. |
| Revisión independiente del alcance y la consistencia | Detectó que dos lecturas separadas permitían contar una visita solo en el desglose. La regresión reprodujo total 1 y desglose 2; se corrigió al leer ambos en una sentencia PostgreSQL. Revisión focal aprobada. |
| `pytest -q analytics/tests` en PostgreSQL/Redis | 27 aprobadas, incluidas las 8 de T3. Verifica reasignación, roles, procedencia DEMO y consistencia de los conteos. |
| Vitest `ProviderMetrics.test.tsx` y `Workspace.test.tsx` | 48 aprobadas; incluyen acceso retirado, filtros y espacio operativo. |
| Ruff focal, OpenAPI `spectacular --validate --fail-on-warn`, typecheck y build | Aprobados. |

Seguimiento: se agregó el selector de período y se impidió que una consulta devuelva datos si la membresía, el rol o la cuenta cambian después de la guarda inicial. La regresión reprodujo cuatro respuestas 200 antes del ajuste. La revisión independiente aprobó ambos cambios; 12/12 backend focal, 51/51 Vitest con Workspace y tipos/lint aprobados. La suite analítica conjunta posterior aprobó 41/41 y OpenAPI no emitió advertencias.

Alcance comprobado: pruebas con datos sintéticos. No se ejecutó un recorrido visual en navegador para esta pantalla ni la matriz integral de E6.3. Sin publicación ni cambios en producción.

## E6.2 T4 — Métricas del Colaborador

En la rama local, `/colaborador` muestra el período, clientes vinculados y visitas atribuidas del perfil habilitado. Solo nombra comercios visibles actualmente en la selección vigente; los ocultos conservan sus visitas en un contador separado sin ID ni nombre. «Mis comisiones» conserva su destino y sus propios importes.

| Comprobación | Resultado |
|---|---|
| PostgreSQL y Redis aislados | 10 pruebas focales aprobadas; incluyen baja, inactivación o cambio de rol durante la lectura, procedencia, paginación y conservación de comisiones. Suite analítica integrada: 37 aprobadas antes del ajuste de enumeración OpenAPI. |
| Revisión y reexamen de interfaz | Se corrigieron la falta de filtro de período y la recuperación desde una página que deja de existir. Se preserva el período y se descartan respuestas tardías de otra sesión. |
| Vitest focal y `Workspace.test.tsx` | 6 y 44 aprobadas tras el ajuste. La ejecución completa anterior al ajuste registró 444/444 y las pruebas locales de proxy/política de auditoría, 25/25. |
| Ruff, validación OpenAPI, typecheck y lint focal | Aprobados. |

Sin publicación ni cambios al historial de visitas, QR o comisiones. La matriz E6.3, el control real de escritorio/móvil y la auditoría del registro externo no constan ejecutados.
