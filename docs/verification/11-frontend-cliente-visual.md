# Mejora visual del Cliente: resumen y verificación

La rama `feature/frontend-cliente-visual` parte de `a62a1af` e implementa las etapas T1–T8 del [plan visual](../superpowers/plans/2026-10-27-frontend-cliente-visual.md). Cada etapa tuvo revisión independiente y los hallazgos identificados se corrigieron en commits posteriores. La revisión integral del conjunto sigue pendiente.

| Área | Antes | Después |
| --- | --- | --- |
| Navegación | La navegación del Cliente compartía la estructura general. | Barra inferior y menú adaptados al Cliente, con foco gestionado al cambiar de pantalla. |
| Catálogo | El descubrimiento y los filtros eran menos visibles y no usaban categorías completas. | Categorías de la API, búsqueda y filtros en la URL, tarjetas y detalle con ubicación y copia. |
| Red y recomendaciones | La red no ofrecía una ficha previa interactiva. | Vista Red/Lista y ficha seleccionable; el contenido privado se retira y revalida ante denegaciones o cambios de contexto. |
| Inicio | La portada ofrecía menos orientación del recorrido. | Categorías, explicación interactiva y resumen de viaje con datos disponibles de la sesión. |
| Mi viaje | El historial se presentaba sin pasaporte interactivo. | Alternancia Pasaporte/Historial, visitas anuladas y nombre actual del comercio cuando está disponible. |
| Visitas | La confirmación ofrecía menos información sobre el resultado. | Pasos para QR y PIN, prevención de envíos simultáneos y resultado confirmado por el servidor; se conserva el reintento idempotente. |
| Acceso, perfil y tienda | No se podía mostrar la contraseña ni ampliar la ilustración de tienda. | Controles accesibles de contraseña, perfil con estado de verificación y ampliación de ilustración en flujo normal. La tienda sigue siendo de ejemplo. |

## Comprobaciones y límites

Durante las etapas se ejecutaron pruebas focales, lint, tipos y compilación. En T7 se registraron 267 pruebas de interfaz y una del proxy aprobadas; posteriormente T8 y su corrección tuvieron 39 pruebas focales aprobadas. La navegación T1 se comprobó en navegador a 320 y 390 px con teclado; las demás pantallas y el ajuste del correo largo en perfil requieren comprobación visual real.

En el cierre se ejecutaron `pytest credits/tests/test_credits.py credits/tests/test_consumption_history_presentation.py -q` sobre PostgreSQL/Redis aislados: 27 pruebas aprobadas. Lint, tipos y compilación frontend aprobaron; JavaScript 122,54 kB gzip. La primera suite completa terminó con 278/279 pruebas UI y 1/1 del proxy: falló una espera del panel Prestador observada también en la referencia. La prueba aislada pasó y se amplió su espera de uno a cinco segundos; el archivo completo pasó con 42 pruebas. Después, `pnpm run test -- --maxWorkers=1 --no-file-parallelism` aprobó las 279 pruebas UI y la prueba del proxy.

Entrega en [PR #16](https://github.com/SebaaM/llave-extra/pull/16), en borrador hacia develop. El [ajuste posterior aprobado el 30/10](13-ajustes-vista-cliente.md) registra la nueva presentación y QA real parcial ya disponible, además de una regresión automatizada de redención automática al iniciar sesión. Siguen pendientes el recorrido HTTP completo con QR sintéticos y la cobertura visual integral que no figura como realizada en esa evidencia. No se usó SQLite ni se afirma integración externa de pagos.
