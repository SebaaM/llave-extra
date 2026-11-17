# Quitar selecciones desde el mismo catálogo

Corrección solicitada el 17/11/2026 sobre el corte local `e947765`. El listado administrativo alterna **Destacar / Quitar destacado**; el catálogo privado alterna **Agregar a mi carpeta / Quitar de mi carpeta**. Se conservan las pantallas de selección separadas.

## Causa y alcance

La API ya permitía retirar ambas selecciones. El listado de destacados reemplazaba el botón por texto estático «Seleccionado» y el catálogo del Colaborador deshabilitaba «Ya está en tu carpeta». Se reprodujeron ambos bloqueos en localhost y se confirmó que la retirada desde las pantallas separadas funcionaba.

- Destacados reutiliza PATCH con el booleano inverso y la versión de la ficha actualizada. El límite de cinco bloquea agregar, no retirar.
- La carpeta reutiliza PUT con objeto vacío y DELETE sin cuerpo sobre la ruta privada de la selección propia. Se conservan bloqueo mientras hay una escritura pendiente, errores y denegaciones.
- No cambian Python, permisos, bloqueos del dominio, QR, datos históricos, límites, migraciones, dependencias ni OpenAPI.

## Verificación

Comandos ejecutados desde `frontend` con las dependencias locales bloqueadas ya instaladas.

| Comprobación | Resultado observado |
|---|---|
| Regresiones antes del cambio | RED: ambas fallaron porque no existían las acciones de quitar en la fila/tarjeta. |
| `node node_modules/vitest/vitest.mjs run src/product/admin/FeaturedBenefitsPage.test.tsx src/product/workspace/Workspace.test.tsx --configLoader runner --reporter dot` | 45 pruebas aprobadas. Cubren retirar con cinco destacados, reutilizar la versión nueva y PUT → DELETE → PUT desde la misma tarjeta. |
| `node node_modules/vitest/vitest.mjs run --configLoader runner --maxWorkers 4 --reporter dot` | 437 pruebas aprobadas en 40 archivos. JSDOM emitió avisos de navegación no implementada, sin fallos de pruebas. |
| `node node_modules/eslint/bin/eslint.js .` | Aprobado. |
| `node node_modules/typescript/bin/tsc -b --pretty` | Aprobado. |
| `node --test tests/proxy-config.test.mjs` | Una prueba aprobada. |
| `node node_modules/vite/bin/vite.js build --configLoader runner --outDir ../.superpowers/sdd/06-analitica-salida/site` | Aprobado; salida ignorada servida en la demo existente. Advertencia informativa por salida fuera de frontend. |

Revisión independiente del diff funcional sin bloqueos; el revisor no ejecutó pruebas ni navegador. Las comprobaciones de ejecución fueron realizadas por el orquestador.

## Prueba real en la demo aislada

- En `/gestion/beneficios-destacados`, agregar el beneficio sintético de Café del Canal habilitó **Quitar destacado** en su fila. Enter lo retiró y el contador volvió de dos a uno. Recargar confirmó que seguía sin destacar.
- En `/colaborador/catalogo`, **Quitar de mi carpeta** retiró la selección sintética del Mirador del Bosque y habilitó **Agregar a mi carpeta**. Se confirmó el estado al recargar y se volvió a agregar desde esa misma tarjeta.
- Se restablecieron las selecciones originales del laboratorio: un destacado y tres beneficios en la carpeta probada. No se cargaron datos adicionales ni se tocaron otras carpetas.
- Inspección en escritorio y móvil de 320 px, sin desborde horizontal. Capturas locales fuera del repositorio, sin QR, PIN ni credenciales.

No se repitió la suite backend: no hay cambios de servidor. La prueba de navegador sí usó las APIs reales de la demo con PostgreSQL sintético; no valida producción ni integraciones externas.
