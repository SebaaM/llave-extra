# Frontend visual e interactivo del Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Aplicar el método que autorice el usuario y las reglas de AGENTS.md: solo el orquestador asigna implementadores y revisores; los implementadores no delegan ni crean sus propios revisores. No iniciar implementación por la sola existencia de este plan.

**Goal:** mejorar descubrimiento, comprensión y seguimiento del viaje mediante componentes visuales e interactivos coherentes con Llave Extra.

**Architecture:** evolución incremental de ProductShell y páginas React existentes, con componentes enfocados y CSS acotado al producto. Reutilizar APIs E2–E4 y extender categorías públicas completas e historial propio con nombre del comercio; conservar autenticación, selección canónica y autorización de medios. Tienda sigue siendo catálogo estático de ejemplo. El usuario autoriza funciones API necesarias para el funcionamiento; esta planificación concreta las dos extensiones justificadas, sin iniciar código.

**Tech Stack:** React 19, TypeScript, Tailwind 4 y CSS existente; Node 24.19.0, pnpm 11.22.0; Django/DRF, PostgreSQL, Python 3.13.16, uv 0.11.3; Docker Compose.

**Spec:** [propuesta de diseño](../specs/2026-10-27-frontend-cliente-visual-design.md).

**Actualización 30/10/2026:** T1–T8 frontend están implementadas y revisadas por etapa en `feature/frontend-cliente-visual`. El cierre integral, QA real y entrega aún están pendientes; el [resumen antes/después](../../verification/11-frontend-cliente-visual.md) recoge alcance y límites. Los apartados de estado y casillas siguientes conservan la planificación histórica.

**Estado:** plan preparado el 27/10/2026; dirección visual guía turística + pasaporte todavía propuesta. Backend de T2/T2b implementado y verificado por pedido posterior API primero; frontend pendiente. [Evidencia de la entrega API](../../verification/12-api-cliente-visual.md).

**Ejecución parcial autorizada — 27/10/2026:** el usuario solicita implementar primero las mejoras de API. Se ejecutaron exclusivamente las partes backend de T2 y T2b, con pruebas PostgreSQL y documentación; hooks, tipos y pantallas frontend quedan pendientes. Rama `feature/api-cliente-visual` desde `origin/develop` en `754982d`; no depende de integrar PR #12/#13 para estas dos APIs. Producto `e3f04fa`, 108 pruebas PG/Redis y QA HTTP real aprobados. T0/T1 y los pasos frontend no se declaran terminados por este corte API independiente.

## Global Constraints

- Conservar Beneficios como experiencia principal y Pasaporte en Mi viaje.
- Sin dependencias nuevas, migraciones ni cambios a reglas de consumo, crédito, stock o pagos.
- Controles táctiles de al menos 44 × 44 px, foco visible y contraste de texto normal de al menos 4.5:1.
- Microinteracciones de 160–220 ms en opacidad/transformación; estampado de hasta 450 ms. Respetar `prefers-reduced-motion`.
- Variables `--client-` bajo `.product-shell` y clases `client-*`; no modificar estilos globales de paneles administrativos/operativos.
- Contratos propuestos: categorías públicas completas y `provider_name` aditivo en historial propio; actualizar `docs/api.md` y `@extend_schema`/serializadores en la tarea que los entrega. Otros cambios API requieren necesidad concreta, permisos y pruebas dentro del alcance de este diseño.
- `FolderBenefit` sigue siendo canónico; cada acceso privado lo autoriza el servidor. No resolver historial privado mediante el catálogo público.
- QR, PIN, tokens, carpetas, saldo e historial no se persisten en URL ni almacenamiento nuevo.
- Conservar reintentos idempotentes y guardas de sesión. Ninguna referencia inválida degrada a consumo directo.
- Tienda: nueve ejemplos, precios ilustrativos, sin checkout, canje, stock remoto ni precarga nueva de datos privados.
- No usar SQLite para validar el dominio o integración. Docker es la opción local predeterminada.
- GitFlow `feature/*` → `develop`, Conventional Commits en español; sin merges ni commits de secretos.
- Este plan no inicia E6, auditoría activa, compra del Cliente ni sandbox de pagos.

## Review Focus

1. Catálogo cambia o se apaga durante la navegación: categorías, fotos, red y detalle no conservan contenido público antiguo como vigente. Pruebas T2/T3/T4.
2. Cambio de carpeta/cuenta o respuesta privada tardía: ficha previa, fotos y resumen se limpian y no aparecen en otra sesión. Pruebas T1/T4/T5/T6.
3. URL con filtros/página obsoletos y navegación atrás: conservar controles consistentes y ofrecer recuperación sin bucles. Pruebas T3.
4. Consumo incierto, doble envío o referencia denegada: mismo cuerpo/clave al reintentar, sin éxito anticipado ni fallback directo. Pruebas T7.
5. Pantalla estrecha, foco, teclado virtual o reducción de movimiento: navegación y estados siguen utilizables, sin exigir hover/animación. Pruebas T1/T4/T7/T8/T9.

## Entregas, orden y archivos

| Entrega | Tareas | Resultado revisable |
| --- | --- | --- |
| A — Base y descubrimiento | T1 → T2 → T3 | Navegación, categorías completas, catálogo y ficha |
| B — Destino y selección | T4 → T5 | Red con ficha previa, Inicio y recomendaciones |
| C — Viaje personal | T2b → T6 → T7 | Historial con comercio, pasaporte y validación de visita |
| D — Terminación | T8 → T9 | Acceso/perfil, tienda y QA integral |

T2b puede empezar tras T1 y habilita T6; T7 sigue a T6 y T8 puede empezar tras T1. La secuencia de arriba reduce cambios simultáneos en `ProductApp.tsx`. No asignar ese archivo ni `styles.css` a dos implementadores a la vez.

Archivos nuevos por responsabilidad, todos bajo `frontend/src/product/` salvo indicación:

- `ui/client.css`: variables y estados compartidos; `ui/EmptyState.tsx` y `ui/CardSkeleton.tsx`: vacíos/carga.
- `ui/CategoryChips.tsx`: selección controlada; `ui/PasswordField.tsx`: visibilidad de contraseña.
- `navigation/ClientNavigation.tsx`: navegación del Cliente; no reemplaza el módulo existente `navigation.tsx`.
- `catalog-query.ts`: lectura/escritura de filtros públicos; `useCatalogCategories.ts`: carga pública abortable.
- `NetworkPreview.tsx`: ficha en flujo normal, sin modal; `HowItWorks.tsx`: recorrido seleccionable.
- `journey/Passport.tsx`: vista de sellos; `journey/TripSummary.tsx`: resumen de datos recibidos.
- `VisitResult.tsx`: confirmación de consumo; `AccountPage.tsx`: presentación de perfil extraída de ProductApp.
- Pruebas junto al componente de interacción; CSS puramente visual se comprueba con QA, sin pruebas que repliquen implementación.
- Backend: `providers/catalog_views.py`, `providers/urls.py`, nueva prueba `providers/tests/test_catalog_categories.py`.
- Historial backend: `credits/views.py`, `credits/serializers.py`, nueva prueba `credits/tests/test_consumption_history_presentation.py`; tipo cliente en `api.ts`.
- Evidencia final: `docs/verification/11-frontend-cliente-visual.md`.

## T0 — Preparación de la ejecución

- [ ] Leer spec, `AGENTS.md`, `CONTEXT.md`, `ToDo.md`, roadmap, `docs/gitflow.md` y contrato de API.
- [ ] Revisar árbol local y estado remoto de las dependencias registradas (#13/#12). Crear `feature/frontend-cliente-visual` desde `develop` actualizado; si faltan dependencias, documentar y preparar su integración conforme a GitFlow, sin mezclar ni fusionar PRs automáticamente.
- [ ] Guardar referencia de commit/base y capturas con datos sintéticos de Inicio, Beneficios, detalle, red, Recomendaciones, Mi viaje, QR, perfil/acceso y Tienda en la evidencia. Medir build base.
- [ ] Ejecutar comprobaciones base del bloque de verificación; registrar fallos previos separadamente. No corregir otras etapas como parte implícita del rediseño.

## T1 — Base visual y navegación del Cliente

**Archivos:** crear `ui/client.css`, `ui/EmptyState.tsx`, `ui/CardSkeleton.tsx`, `navigation/ClientNavigation.tsx`, `navigation/ClientNavigation.test.tsx`; modificar `Layout.tsx`, `ProductApp.tsx`, `styles.css` solo donde se retire CSS sustituido, `ProductApp.test.tsx`.

**Interfaces:** `ClientNavigation({user, path}: {user: User | null; path: string})`; `EmptyState({title, description, children?}: {title: string; description: string; children?: ReactNode})`; `CardSkeleton({count}: {count: number})`. Extender ProductShell con `path: string` pasado por ProductApp.

- [ ] Agregar pruebas de barra solo para `TOURIST` autenticado, ruta activa con `aria-current`, enlaces accesibles a Tienda/Cuenta, cierre/cambio de sesión y ausencia en `/consumo` y pantallas de credenciales. Ejecutarlas y comprobar el fallo por comportamiento ausente.
- [ ] Implementar variables visuales de la spec, cabecera compacta y navegación inferior; usar `ProductLink`, reservar espacio inferior con safe-area y menú mediante `details/summary`. Conservar accesos de otros roles y logout.
- [ ] Integrar vacíos/carga compartidos solo donde los necesitan tareas siguientes; no reescribir todos los estilos existentes.
- [ ] Ejecutar pruebas de navegación/ProductApp, lint, tipos y build; QA 320/390 px con teclado virtual y zoom de texto 200%, sin controles tapados.
- [ ] Registrar evidencia, revisión independiente y commit `feat: mejorar navegación y base visual del cliente`.

## T2 — Categorías públicas completas

**Corte API primero:** backend implementado en `a1e4b5f` + corrección `c52bea8`, revisión independiente aprobada. Hook/tipos/consumo frontend pendientes; esta tarea mixta aún no se marca completa en su totalidad.

**Archivos:** modificar `backend/providers/catalog_views.py`, `backend/providers/urls.py`, `docs/api.md`; crear `backend/providers/tests/test_catalog_categories.py`, `frontend/src/product/useCatalogCategories.ts`, `frontend/src/product/useCatalogCategories.test.tsx`; modificar `catalog.ts`.

**Interfaces:** `CatalogCategoriesView.get(request)` → `{results: string[]}`; `catalogCategories(signal?: AbortSignal): Promise<{results: string[]}>`; `useCatalogCategories(enabled: boolean | null)` → `{categories: string[]; loading: boolean; error: string; retry: () => void}`. `enabled !== true` no solicita categorías y devuelve lista vacía.

- [ ] Escribir pruebas PostgreSQL: categorías de todo el catálogo aunque el beneficio quede después del registro 24; excluir vencidos, futuros, borradores, prestadores no publicados y categorías vacías/blancas; deduplicar valores exactos. Catálogo apagado devuelve 404/no-store; salida sin campos privados. Comprobar fallo inicial.
- [ ] Implementar `GET /api/v1/catalog/categories/`, anónimo y solo lectura: `require_catalog()`, categorías desde `catalog_benefits()`, valores originales no vacíos y orden determinista `(valor.casefold(), valor)`. Sin parámetros de filtros/página y sin migración. Conservar `iexact` y hacer utilizables valores con espacios externos: coincidencia raw primero, fallback histórico recortado solo si esa categoría exacta no existe; resolverlo antes de search. Cubrir categorías espaciadas y normales coexistentes, fallback y búsquedas sin coincidencias sin saltar de categoría.
- [ ] Documentar respuesta/esquema con `@extend_schema`, 404 y política pública en `docs/api.md`; el GET no usa locks ni escribe datos de dominio nuevos.
- [ ] Implementar cliente sin JWT ni persistencia y hook abortable con revalidación por foco/visibilidad: limpiar datos al deshabilitar, fallar o quedar obsoleta la solicitud; no recorrer todas las páginas de beneficios para construir categorías. Probar aborto/404/reintento y retorno a la pestaña con categorías cambiadas.
- [ ] Ejecutar pruebas focales PG/UI y validación de OpenAPI, Ruff, lint/tipos/build; revisión independiente y commit `feat: exponer categorías vigentes del catálogo público`.

## T3 — Catálogo y detalle de beneficios

**Archivos:** crear `ui/CategoryChips.tsx`, `catalog-query.ts`, `catalog-query.test.ts`; modificar `CatalogPages.tsx`, `CatalogPages.test.tsx`, `ProductApp.tsx`, `ui/client.css`.

**Interfaces:** `CategoryChips({categories, value, onChange}: {categories: string[]; value: string; onChange: (value: string) => void})`; `CatalogQuery = {search: string; category: string; page: number}`; `readCatalogQuery(search: string): CatalogQuery`; `catalogHref(query: CatalogQuery): string`; `CatalogPage({search}: {search: string})` consume el search de ProductApp. No modificar la API de `usePublicCatalog`.

- [ ] Probar URL directa, búsqueda/categoría, reinicio a página 1, limpiar filtros, atrás/adelante, categoría retirada y página inválida. `page` no entero/menor a 1 inicia en 1; un 404 con catálogo habilitado y página >1 ofrece volver a página 1, sin inferir que el catálogo está apagado.
- [ ] Ajustar `usePublicCatalog.ts` y sus pruebas si hace falta para distinguir 404 de paginación de catálogo deshabilitado; volver a consultar config ante esa ambigüedad. Conservar aborto y revalidación por foco.
- [ ] Implementar URL como fuente única de filtros aplicados; escritura mediante navegación existente. Usar categorías T2, mostrar filtro desconocido activo y permitir quitarlo. Si categorías falla, mantener búsqueda de beneficios utilizable y ofrecer reintento.
- [ ] Rediseñar tarjetas como postales; mantener condiciones y etiquetas demo. Agregar vacíos/carga sin mostrar contenido viejo como vigente; no inferir descuentos desde texto ni inventar popularidad.
- [ ] Reorganizar detalle en beneficio, uso y ubicación; condiciones esenciales siempre visibles. Copiar dirección solo tras acción del usuario, informar éxito/error y mantener dirección seleccionable como alternativa; mapa/web pasan por `safeExternal`.
- [ ] Probar fallo de portapapeles, foto ausente, texto largo, apagado durante ficha abierta y paginación tras borrar filtros. Ejecutar suite focal, lint/tipos/build y QA visual; revisión y commit `feat: renovar exploración y detalle de beneficios`.

## T4 — Red y ficha de vista previa

**Archivos:** crear `NetworkPreview.tsx`, `NetworkCanvas.test.tsx`; modificar `NetworkCanvas.tsx`, `BenefitsPages.tsx` cuando corresponda, `ui/client.css`.

**Interfaces:** mantener props de `NetworkCanvas`; `NetworkPreview({item, folderId, onOpenProvider, onClose}: {item: NetworkItem; folderId?: string; onOpenProvider?: (id: string) => void; onClose: () => void})`. Contexto público usa PublicPhoto/ProductLink; privado usa PrivatePhoto y callback autorizado.

- [ ] Probar seleccionar nodo, cerrar ficha y Red/Lista mostrando los mismos resultados; cambio de página/carpeta y 401/403/404 desmontan la selección. En privado, comprobar que no se llama al detalle ni medio público como fallback.
- [ ] Implementar selección y ficha en flujo normal, alcanzable por teclado/táctil, con acción separada de abrir detalle. Limpiar selección al iniciar recarga, cambiar contexto o fallar autorización; conservar callback de revocación.
- [ ] Conservar presentación administrativa, tamaño/paginación e intervalos existentes. Pausar avance automático mientras hay selección, hover, foco dentro, pestaña oculta o movimiento reducido; cambiar Red/Lista conserva página y no amplía resultados.
- [ ] No agregar filtro global por categoría a `/network/`: su contrato solo admite `page`. No presentar posiciones como coordenadas geográficas.
- [ ] Ejecutar pruebas con reloj simulado de pausa/reanudación, suite de medios, lint/tipos/build y QA móvil; revisión y commit `feat: agregar vista previa y lista a la red de beneficios`.

## T5 — Inicio, recorrido y recomendaciones

**Archivos:** crear `HowItWorks.tsx`, `HowItWorks.test.tsx`, `HomePage.test.tsx`, `BenefitsPages.test.tsx`, `journey/TripSummary.tsx`; modificar `HomePage.tsx`, `BenefitsPages.tsx`, `ProductApp.tsx`, `ui/client.css`.

**Interfaces:** `HowItWorks()` sin API, cuatro pasos seleccionables mediante botones `aria-pressed`; `TripSummary({wallet, progress}: {wallet: Wallet | null; progress: Progress | null})`; HomePage conserva `settings` y agrega `trip?: {wallet: Wallet; progress: Progress}`. Pasar `trip` solo para Cliente actual con ambos datos disponibles.

- [ ] Probar que categoría de portada abre URL T3, apagar catálogo retira selector/destacado y muestra alternativa QR; recorrer los cuatro pasos con teclado. No hay avance automático del recorrido.
- [ ] Implementar postal destacada e interacción de categorías T2. Mantener textos `SiteSettings`, fotografías autorizadas y explicación diferenciada de QR de colaborador y QR/PIN de prestador.
- [ ] Agregar resumen de viaje solo desde estado vigente en memoria; no nuevas precargas ni historial para Inicio/Tienda. Si no hay datos, mostrar enlace a Mi viaje, sin números ficticios.
- [ ] Aplicar tarjetas/cabecera de selección privada y filtros existentes; conservar identificador técnico presentado como carpeta, sin inventar nombres/notas. Probar cambio de carpeta con respuesta tardía y retirada de vista por revocación.
- [ ] Ejecutar pruebas de Home/Benefits/ProductApp, lint/tipos/build y QA de portada/móvil; revisión y commit `feat: enriquecer inicio y recomendaciones del cliente`.

## T2b — Nombre del comercio en el historial propio (prerrequisito de T6)

**Corte API primero:** backend implementado en `e3f04fa`, revisión independiente aprobada. El tipo opcional frontend se incorpora cuando se ejecute la etapa visual, no en esta entrega.

**Archivos:** modificar `backend/credits/views.py`, `backend/credits/serializers.py`, `frontend/src/product/api.ts`, `docs/api.md`; crear `backend/credits/tests/test_consumption_history_presentation.py`.

**Interfaces:** `ConsumptionHistorySerializer` agrega `provider_name: CharField`; `MyConsumptionsView.get` conserva lista y campos actuales, agregando `provider_name` desde `item.provider.name`; `Consumption` TypeScript agrega `provider_name?: string` por compatibilidad con respuesta anterior. No modificar `ConsumptionResponseSerializer` del POST ni servicios/resultados idempotentes.

- [ ] Escribir pruebas PG: cada Cliente obtiene solo su historial con nombre; anónimo/otros roles no acceden; visitas anuladas y comercio despublicado siguen mostrando el nombre actual a su propietario; catálogo apagado no afecta historial. El DTO no incorpora fotos, QR, PIN, email ni acceso a carpeta. Ejecutar y confirmar fallo inicial por campo ausente.
- [ ] Implementar campo aditivo y `select_related("provider")` sobre la consulta ya filtrada por `tourist=request.user`. Conservar orden, estados, cabeceras privadas y permisos, sin solicitudes a catálogo ni modelos nuevos.
- [ ] Probar renombre de comercio: respuesta refleja nombre actual sin reescribir Consumption ni auditorías. Medir consultas con varios registros y comprobar que no crecen una por consumo; aislar la consulta del historial de las consultas de autenticación.
- [ ] Actualizar tipo opcional frontend, serializador de OpenAPI y `docs/api.md`, aclarando que el nombre es actual. Fallback de T6 usa texto de estado si falta; no atribuir nombres históricos inexistentes.
- [ ] Ejecutar prueba focal y E4 sobre PG, Ruff/OpenAPI, tipos y pruebas frontend afectadas; revisión independiente y commit `feat: identificar comercios en el historial propio de visitas`.

## T6 — Pasaporte e historial

**Archivos:** crear `journey/Passport.tsx`, `JourneyPage.test.tsx`; modificar `JourneyPage.tsx`, `ui/client.css`.

**Interfaces:** conservar firma `Trip({wallet, progress, history, onRefresh})`; `Passport({history}: {history: Consumption[]})`. El modo Pasaporte/Historial vive solo en memoria del componente.

- [ ] Probar ambos modos con historial válido/anulado, vacío, campos largos, saldo congelado y datos todavía nulos. Mostrar `progress.total/target/completed` tal como llegan, sin derivar progreso desde saldo ni historial parcial.
- [ ] Implementar sellos con nombre actual del comercio de T2b, fecha/estado/créditos y vista compacta equivalente; visitas anuladas tienen texto e icono específicos. Probar nombre ausente en respuesta anterior y fallback de estado. No consultar catálogo ni carpetas para buscar nombres/fotos ni presentar nombre actual como snapshot histórico.
- [ ] Mostrar `max(target-total, 0)` visitas restantes cuando los datos son válidos; conservar aviso de congelación, actualizar y enlace Tienda/Vista previa. Valores nulos no son cero; no animar balance desde cero ni sellos históricos al montar.
- [ ] Ejecutar pruebas de Trip y regresión de cambio de cuenta ProductApp, lint/tipos/build y QA visual; revisión y commit `feat: presentar visitas como pasaporte interactivo`.

## T7 — Referencia QR y resultado de consumo

**Archivos:** crear `VisitResult.tsx`, `ConsumptionPage.test.tsx`; modificar `ConsumptionPage.tsx`, `ReferencePage.tsx`, `api.ts` solo para tipo, `ui/client.css`; ampliar `qr-intent.test.tsx` y `ProductApp.test.tsx` si corresponde.

**Interfaces:** `ConsumptionResult = Consumption & {balance: number}` en `api.ts`; `VisitResult({result}: {result: ConsumptionResult})`; conservar `ConsumePage` y callback `onComplete: () => void`. La confirmación usa `api<ConsumptionResult>` y no modifica saldo local optimistamente.

- [ ] Probar estados sin QR, ingreso de PIN, en vuelo, éxito `VALID`, error, repetido y referencia denegada. PIN acepta 6–12 dígitos con ceros iniciales; pegarlo no lo trunca a seis. Dos envíos rápidos producen una sola solicitud en vuelo, incluyendo activación programática del submit.
- [ ] Probar timeout seguido de reintento: mismo cuerpo y `Idempotency-Key`; cuerpo/mode nuevo genera otra clave. Mientras hay una solicitud en vuelo, congelar controles del comando y usar guarda síncrona para evitar doble envío. Referencia inválida conserva error, sin reenviar directo.
- [ ] Implementar pasos visuales y PIN como único campo, no inputs separados; conservar gestión de intención QR en memoria y no añadir secretos a logs/URL/almacenamiento.
- [ ] Mostrar resultado solo al resolver servidor: para `VALID`, créditos de `award` y saldo `balance` de la respuesta, con estampado de hasta 450 ms; `award=0` no promete premio. Otro estado no recibe sello de éxito. Volver a leer Mi viaje mediante callback existente y distinguir error de actualización de fallo del consumo confirmado.
- [ ] Mejorar presentación de redención de referencia sin confundirla con acreditación. Verificar conservar intención durante login y eliminación después de completarla.
- [ ] Ejecutar pruebas focales/UI, regresiones E4 PostgreSQL y QA real con QR sintéticos, sin publicar tokens; revisión y commit `feat: aclarar validación y confirmación de visitas`.

## T8 — Acceso, perfil y terminación visual de tienda

**Archivos:** crear `ui/PasswordField.tsx`, `PublicPages.test.tsx`, `AccountPage.tsx`, `AccountPage.test.tsx`; modificar `PublicPages.tsx`, `ProductApp.tsx`, `shop/ShopPage.tsx`, `shop/ShopPage.test.tsx`, `shop/shop.css`, `ui/client.css`.

**Interfaces:** `PasswordField({id, label, value, onChange, autoComplete, disabled?}: {id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: 'current-password' | 'new-password'; disabled?: boolean})`; `AccountPage({user, notice, onResend}: {user: User; notice: string; onResend: () => Promise<void>})`. Errores asíncronos de reenvío los presenta el componente; callback conserva payload genérico existente.

- [ ] Probar mostrar/ocultar contraseña sin submit ni perder valor, email inválido/error local asociado al campo, espera y respuestas genéricas de recuperación. No duplicar política de contraseña del servidor ni almacenar credenciales.
- [ ] Extraer perfil actual a AccountPage y aplicar estado verificado/pendiente, reenvío y acceso Mi viaje; sin edición nueva de cuenta ni roles. Probar habilitación/deshabilitación durante reenvío.
- [ ] Aplicar identidad de pasaporte a acceso y perfil; conservar login con QR e intención de recuperación y registro exclusivamente `TOURIST`.
- [ ] Agregar ampliación de SVG en flujo normal con botón `aria-expanded`, accesible por teclado/tacto, sin modal ni dependencia 3D. Mantener precios/medidas de ejemplo, etiquetas y búsqueda/orden/paginación existentes; no generar vistas no disponibles del producto.
- [ ] Probar que abrir/ampliar producto no llama a shop, wallet, progreso ni historial por la nueva interacción y que la ruta Tienda conserva la restauración de sesión actual sin precarga privada. Verificar reducción de movimiento y ausencia de botones comprar/canjear.
- [ ] Ejecutar pruebas focales y suite ProductApp, lint/tipos/build; QA tienda y credenciales en móvil; revisión y commit `feat: completar acceso y detalles visuales de la tienda`.

## T9 — Verificación integral y entrega

**Archivos:** crear `docs/verification/11-frontend-cliente-visual.md`; actualizar `CONTEXT.md`, `ToDo.md`, `docs/plans/00-roadmap.md`, este plan y spec con decisiones finales; revisar `docs/api.md` y `AGENTS.md` por coherencia. No modificar instrucciones de dominio si siguen vigentes.

- [ ] Ejecutar una vez suite completa frontend y backend PG/Redis después de integrar las tareas, Ruff, migraciones sin drift, OpenAPI, lint/tipos/build. Repetir solo por cambios/fallos/concern concreto.
- [ ] QA HTTP real sobre entorno sintético aislado: anónimo, Cliente verificado/no verificado, cambio de cuenta, catálogo apagado y carpeta revocada; smoke de `/gestion`, `/admin/` y espacios Prestador/Colaborador para detectar estilos/reglas afectadas.
- [ ] Recorrer 320/390/768/1440 px, zoom de texto 200%, teclado, movimiento reducido, portapapeles denegado, imagen fallida y red lenta/error. Guardar capturas antes/después sin datos/códigos reales. Verificar pausas y que ninguna acción depende de hover.
- [ ] Comparar build con base: incremento máximo propuesto de 20 KiB gzip en JavaScript de entrada; si se excede, identificar y reducir causa o documentar cambio de presupuesto para revisión. Sin instalaciones nuevas ni inventar métricas de producción.
- [ ] Revisión independiente integral: contrato público/categorías, aislamiento de datos privados, idempotencia, accesibilidad y coherencia visual. Corregir y volver a revisar los cambios materiales antes de entregar.
- [ ] Actualizar evidencia con comando, resultado y límites; marcar tareas implementadas, actualizar contexto/pendientes/roadmap sin afirmar completadas E6 o F3 transaccional. Commit documental `docs: registrar verificación del frontend visual del cliente`.
- [ ] Publicar PR hacia `develop`, declarar dependencias y adjuntarlo al chat, sin fusionar. Entregar resumen, capturas y límites de validación.

## Comandos de verificación previstos

Desde la raíz, con servicios Docker ya preparados mediante las guías existentes. Estos comandos son para la futura ejecución, no resultados de esta planificación. No imprimir `.env` ni ejecutar seeds/migraciones sobre datos principales. Usar proyecto Compose/BD/Redis de QA aislados para ensayos; preservar el comando/proyecto seleccionado en la evidencia.

```powershell
docker compose exec -T frontend pnpm run lint
docker compose exec -T frontend pnpm run typecheck
docker compose exec -T frontend pnpm run test
docker compose exec -T frontend pnpm run build
docker compose exec -T backend uv run --locked ruff check .
docker compose exec -T backend uv run --locked python manage.py makemigrations --check --dry-run
docker compose exec -T backend uv run --locked python manage.py spectacular --file /tmp/llave-extra-openapi.yaml --validate
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend uv run --locked pytest -q
```

Focales: frontend `docker compose exec -T frontend pnpm exec vitest run src/product/CatalogPages.test.tsx` (sustituir lista por archivos de la tarea); backend `docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend uv run --locked pytest providers/tests/test_catalog_categories.py providers/tests/test_catalog.py providers/tests/test_network.py -q`; T7 agrega `credits/tests/test_credits.py`.

Éxito esperado: procesos con código 0, suites sin fallos, Ruff sin hallazgos, migraciones sin cambios pendientes y esquema sin errores/warnings introducidos. Reportar cantidades reales al ejecutar, no reutilizar las históricas del contexto.

El montaje frontend de Compose solo sincroniza `src`, `index.html` y `vite.config.ts`: antes de probar archivos fuera de esos montajes, reconstruir la imagen correspondiente. No montar `node_modules` o `.venv` del host.

## Ampliaciones fuera de la entrega principal

| Propuesta | Dependencia antes de planificar implementación |
| --- | --- |
| Guardar para visitar | Modelo/contrato por Cliente, permisos, eliminación/revalidación y política explícita de visibilidad para beneficios privados |
| Nombre/notas del colaborador | DTO privado con campos de presentación autorizados, edición y reglas de privacidad; nunca usar email como sustituto |
| Pines geográficos y rutas | Coordenadas verificadas, proveedor cartográfico, permisos para cada punto y criterio de uso de ubicación |
| Filtros globales de la red | Extensión de contrato público/privado de red; resultados/paginación/pausas coherentes |
| Galería o visor 3D | Fotos/modelos propios, derechos, carga diferida y presupuesto móvil; distinguir ilustración de producto real |
| Etiqueta estructurada de descuento | Campos/validaciones administrativas y API; no parsear condiciones libres |
| Compra/canje y pedidos | Etapa transaccional F3, servicios E5 y límites/sandbox existentes |

## Autorrevisión documental

- [x] Todas las secciones propuestas tienen tarea o ampliación explícita; no hay funciones comerciales implícitas.
- [x] Interfaces y fuentes cotejadas con código actual; nombre del comercio se entrega mediante T2b y el nombre del colaborador continúa fuera del contrato.
- [x] Categorías no dependen de una página parcial; URL y 404 de página inválida tienen recuperación explícita.
- [x] Casos de Review Focus asignados a pruebas/QA de sus tareas; estados nulos, revocación y reintentos preservados.
- [x] Documentación distingue contratos propuestos de disponibles y comprobaciones futuras de las realizadas.
- [x] Revisión documental independiente completada, incluyendo T2b y consumo del campo opcional en T6; sin contradicciones relevantes pendientes. No equivale a revisión de implementación.
- [ ] Revisar dirección visual y alcance con el usuario antes de ejecutar; método de ejecución todavía no seleccionado.

Verificación documental inicial del 27/10/2026, antes del pedido API primero: `git diff --check` sin hallazgos; comprobación PowerShell de enlaces relativos y whitespace de los dos documentos nuevos aprobada; se verificó presencia de T0–T9 y referencias en contexto, pendientes y roadmap. En esa preparación no se ejecutaron suites funcionales ni build por tratarse de documentación; la ejecución posterior de API tiene sus propios resultados en la evidencia enlazada al inicio.
