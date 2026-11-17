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
