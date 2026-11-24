# Informe T4 — Red y ficha de vista previa

Fecha: 29/10/2026. Rama: `feature/frontend-cliente-visual`. Implementación acotada al brief T4; pendiente revisión independiente del orquestador.

## Cambios

- `NetworkCanvas` conserva sus props, presentación administrativa, distribución visual, tamaño, paginación, intervalo y controles. Los nodos ahora son botones de selección con estado accesible. El selector Red/Lista utiliza exclusivamente los mismos resultados de la página vigente, sin filtros nuevos ni consultas adicionales al alternar.
- `NetworkPreview` presenta foto, categoría/demo, prestador y título del beneficio recibidos. Está en el flujo normal después de los controles, con apertura explícita y cierre; enfoca el título al seleccionar y devuelve el foco al nodo vigente al cerrar. La ficha privada invoca únicamente el callback autorizado; la pública usa `ProductLink` y `PublicPhoto`.
- La ficha pausa el avance automático incluso cuando salen el foco y el puntero. Se mantienen las pausas por acción manual, hover, foco, documento oculto y movimiento reducido. La selección se descarta al cambiar página, carpeta, revisión o versión de sesión, incluso al volver al contexto anterior.
- Se reemplaza el transporte privado duplicado de nodos por `PrivatePhoto`. La red comprueba versión de sesión y aborta cargas anteriores. Nodos/ficha/fotos se desmontan ante 401/403/404 de red, 401/403 de medio o apertura explícita del detalle privado. No existe alternativa hacia medios o detalles públicos al denegarse la carpeta.
- Un 404 de medio retira el contenido visible y revalida la red o el detalle privado. Si el servidor confirma autorización, se muestra el reemplazo de imagen ausente; el archivo fallido queda suprimido en memoria dentro de ese contexto para evitar un bucle. Si la revalidación deniega o falla temporalmente, no se restaura el contenido privado. Las URLs Blob se revocan al desmontar y al resolver tarde; `PrivatePhoto` también descarta éxito o denegación de una sesión anterior.
- `ProviderDetail` retira íntegramente nombre/dirección/contacto/foto ante 401/403/404, controla abortos y versión y ofrece reintento de error transitorio sin mostrar metadatos durante la revalidación. Los cambios en `CatalogPages.test.tsx` actualizan dos expectativas de enlace a botón conforme a la nueva selección previa.
- CSS nuevo bajo `.product-shell` y clases `client-*`: selector, selección, lista, ficha adaptable y controles de 44 px. No se agregaron dependencias, pines geográficos, almacenamiento del navegador ni contratos API.

## RED / GREEN

1. Prueba inicial escrita antes de integrar producto: `pnpm exec vitest run src/product/NetworkCanvas.test.tsx --maxWorkers=1` → **7 fallos / 4 aprobadas**. Fallaban selección/teclado, alternancia, apertura privada separada y revalidación del 404 de medio. Una primera ejecución no llegó a pruebas porque esbuild no podía leer directorios ascendentes desde el sandbox; la repetición autorizada produjo el RED funcional.
2. Tras implementar y ampliar casos, comando focal final desde `frontend`:

   `pnpm exec vitest run src/product/NetworkCanvas.test.tsx src/product/PrivatePhoto.test.tsx src/product/CatalogPages.test.tsx src/product/ProductApp.test.tsx --maxWorkers=1`

   → **4 archivos, 51 pruebas aprobadas, 0 fallos**, código 0, 17,38 s. Incluye 20 casos de T4 en `NetworkCanvas.test.tsx`.

Cobertura: abrir/cerrar por teclado y foco; Red/Lista y página exacta sin nueva consulta; selección al avanzar y regresar; pausa/reanudación de ficha además de pausas actuales; carpeta/sesión A→B, misma carpeta con nueva sesión y respuesta antigua tardía; denegación 401/403/404; callback privado sin consulta pública; medio ausente frente a revocado; blobs visibles y tardíos; detalle 404 y revalidación de medio 404 con resultados 200/403/503; error recuperable y vacío. Las suites existentes conservan la comprobación de tablero/slots, foco/hover, pestaña oculta y movimiento reducido.

## Comprobaciones finales

Entorno nativo: Node **24.19.0**, pnpm **11.22.0**, dependencias bloqueadas ya existentes. Ejecución de herramientas con escalamiento autorizado por la limitación de lectura del sandbox; no se modificaron permisos del sistema ni configuración global de Git. Git se invoca con `-c safe.directory` para este worktree.

| Comando | Resultado |
| --- | --- |
| Suite focal anterior | 51/51, código 0 |
| `pnpm run lint` | Código 0, sin hallazgos |
| `pnpm run typecheck` | Código 0 |
| `pnpm run build` | Código 0; 88 módulos |
| `git diff --check` | Código 0, sin errores de whitespace |

Lint intermedio detectó una dependencia de memoización que React Compiler no podía preservar; el callback se trasladó a la ficha con dependencia estable. Tipos intermedio detectó dos opciones `exact` no admitidas en `getByRole`; fueron retiradas. Ambas comprobaciones finales pasaron.

Build final: JavaScript **398,66 kB / 119,03 kB gzip**, CSS **78,05 kB / 16,48 kB gzip**, HTML **0,61 kB / 0,38 kB gzip**. La comparación con la base integral pertenece a T9.

## Límites y pendientes

- Pruebas de interfaz con respuestas HTTP simuladas; no sustituyen QA HTTP ni visual real. El orquestador realizará QA a 320/390 px, teclado y capturas, y asignará revisión independiente. No se afirma validación de navegador en esta tarea.
- No se modificó backend, modelos, autorización del servidor, contrato OpenAPI ni datos. No se ejecutaron pruebas PostgreSQL por este cambio exclusivamente frontend; la suite integral PostgreSQL/Redis corresponde a T9. `FolderBenefit` y la revalidación del servidor siguen siendo autoridad.
- El archivo fallido se conserva como imagen ausente solo en memoria del componente/contexto; una nueva sesión o montaje permite una nueva consulta. Un 404 de medio no se interpreta automáticamente como revocación.
- No se ejecutó la suite completa ni se modificó el timeout conocido de `Workspace.test.tsx`. No se crearon subagentes, PR, push ni merge.
- Contexto, ToDo y estado global del plan se actualizarán por el orquestador en T9 para no declarar la entrega completa durante una tarea parcial. No quedan dudas de implementación que requieran ampliar el contrato.
