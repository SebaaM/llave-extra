# Verificación: mejoras de API para el Cliente — 27/10/2026

## Alcance y base

Pedido del usuario: implementar primero las mejoras de API del plan visual. La entrega se limita a las partes backend de T2 y T2b: categorías públicas completas y nombre actual del comercio en el historial propio. Pantallas, hooks y tipos frontend pendientes.

Rama `feature/api-cliente-visual` desde `754982d9aee6c7d43861278205a52c889b1cee17`, `origin/develop` consultado el 27/10/2026. PR #10 integrado; PR #12/#13 abiertos al consultar. Estas APIs no necesitan sus cambios pendientes. No se fusionó ningún PR. El checkout original, con sus documentos de planificación sin commit, se conserva.

Entorno dedicado: proyecto Compose `llaveextra-api-cliente`, PostgreSQL 17 y Redis con volúmenes propios. Imagen backend construida desde este worktree con `uv sync --locked --all-groups`. `work/api-qa.compose.yaml` solo referencia el `.env` ignorado existente y monta helpers QA; no copia ni imprime credenciales. No se ejecutan pruebas ni migraciones sobre la base principal. No hay migraciones de producto, nuevas dependencias ni cambios al frontend, al POST de consumos o a los resultados idempotentes persistidos.

## Comandos

Prefijo utilizado desde el worktree:

```powershell
docker compose --project-name llaveextra-api-cliente --env-file 'C:/Users/pity_/OneDrive/Documents/ChatGPT/llave extra/.env' -f compose.yaml -f work/api-qa.compose.yaml run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend
```

| Sufijo al prefijo | Resultado |
| --- | --- |
| `uv run --locked pytest providers/tests/test_catalog_categories.py providers/tests/test_catalog.py -q` | 9 aprobadas sobre PostgreSQL en `a1e4b5f` |
| Mismo comando focal después de corregir round-trip de categorías con espacios | 11 aprobadas sobre PostgreSQL en `c52bea8`; regresión previa 1 fallo esperado y 10 aprobadas |
| `uv run --locked ruff check .` | Sin hallazgos en `a1e4b5f` |
| `uv run --locked python manage.py spectacular --file /tmp/api-client-openapi.yaml --validate --fail-on-warn` | Exit 0 sin avisos en `a1e4b5f` |
| `uv run --locked python manage.py makemigrations --check --dry-run` | Sin cambios detectados en `a1e4b5f` |
| `uv run --locked pytest credits/tests/test_consumption_history_presentation.py credits/tests/test_credits.py -q` | 27 aprobadas sobre PostgreSQL en `e3f04fa`; RED previo por ausencia del nuevo campo |
| Ruff, OpenAPI con `--fail-on-warn` y migraciones sin drift tras T2b | Los tres checks aprobados en `e3f04fa` |
| `uv run --locked pytest -q` | **108 aprobadas en 40.16 s**, PostgreSQL/Redis aislados, producto `e3f04fa` |
| Helper `/qa/api_client_http_qa.py` sobre WSGI y HTTP real | Exit 0; categorías 200/no-store, historial propio y aislamiento, catálogo apagado 404 con historial disponible, nombre actual tras renombre/despublicación y POST/replay idénticos |

En categorías se comprobó sensibilidad de la prueba retirando temporalmente la ruta: 404 esperado; después se restauró y pasó la suite. La primera ejecución ya contenía la implementación y detectó una expectativa incorrecta de orden en el test, corregida antes de la validación final; no se presenta como ciclo TDD previo a código.

Revisión T2: inicialmente detectó que una categoría con espacios externos era recortada al filtrar beneficios, pudiendo seleccionar otra categoría. Se corrigió y revisó el rango `a1e4b5f..c52bea8`: coincidencia original primero, respaldo recortado solo si no existe la original, decidido antes de búsqueda. Sin hallazgos abiertos de T2. Ruff y esquema se repitieron sobre la corrección y pasaron.

Revisión T2b aprobada sin hallazgos sobre `c52bea8..e3f04fa`: DTO aditivo privado, nombre actual, guardas del Cliente, FK protegida, consulta constante y ausencia de cambios al POST. Pruebas de la tarea comprueban JWT real para desactivación de usuario y cantidad de consultas constante al pasar de dos a cuatro visitas.

El helper HTTP se ejecutó con el mismo prefijo agregando `-e PYTHONPATH=/app`, con sufijo `uv run --locked python /qa/api_client_http_qa.py`. Inicializa solamente la base por defecto del proyecto aislado mediante migraciones existentes, crea usuarios/comercio/beneficio sintéticos, usa JWT/QR/PIN generados en memoria y hace requests HTTP reales contra WSGI local. No imprime credenciales ni QR; el catálogo desactivado al finalizar pertenece exclusivamente al laboratorio. El servidor temporal se cierra al terminar. No es validación de un servicio externo.

El entorno es PostgreSQL real, nunca SQLite. No se ejecutaron lint/tipos/build del frontend en esta entrega: ningún archivo ni consumidor frontend se modifica y el campo nuevo es aditivo. Los helpers y reportes de trabajo permanecen ignorados; este documento conserva la evidencia resumida. Revisión integral y PR pendientes de cierre.

## Límites

`provider_name` es nombre actual, no snapshot histórico; un comercio despublicado continúa identificado en el historial de su Cliente, sin conceder detalle/medios/carpeta. El catálogo apagado retira categorías públicas, no el historial privado ni la elegibilidad de acreditación. Los cambios de frontend y cualquier función comercial o de pago permanecen fuera; no se declara sandbox externo ni E6 completos.
