# Catálogo público y corrección de acceso administrativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Ejecutar las tareas secuencialmente con revisión independiente y commits Conventional Commits en español.

**Goal:** corregir el acceso admin y entregar catálogo público configurable, consumo directo y frontend sin prototipos.

**Architecture:** mantener los endpoints privados por carpeta y añadir una superficie pública de lectura con su propia política de publicación y configuración administrativa. Hacer opcional la referencia del consumo sin debilitar su transacción ni auditoría. React consume ambos recorridos explícitamente.

**Tech Stack:** Django/DRF, PostgreSQL 17, Redis, React/TypeScript/Tailwind; Docker, uv 0.11.3, pnpm 11.22.0.

**Spec:** [07-catalogo-publico-spec.md](07-catalogo-publico-spec.md).

## Global Constraints

- Exactamente cuatro roles; registro público solo TOURIST, email verificado para acreditar.
- Carpetas privadas autorizadas por servidor; nunca inferir acceso por FolderAccess histórico.
- Consumos y créditos con transacciones, restricciones PostgreSQL e idempotencia.
- GitFlow, commits en español y PR contra develop; no merges ni force push.
- Sin credenciales versionadas; conservar recursos y archivos ajenos.
- Actualizar CONTEXT, AGENTS, ToDo, planes afectados y contrato OpenAPI con cada entrega.

## Review Focus

- /admin/ y sus assets deben llegar a Django, conservando saneamiento de cabeceras y CSRF.
- Deshabilitar el catálogo debe cerrar detalles y medios públicos por URL directa, sin abrir carpetas.
- Cambio de día, prestador inactivo y beneficio futuro/vencido no pueden producir ofertas visibles ni acreditables.
- Consumo directo y referido concurrentes del mismo cliente/prestador deben acreditar una sola vez; el replay es estable y la atribución nunca se inventa.
- Navegación anónima, sesión cambiada, respuestas tardías y catálogo deshabilitado deben limpiar datos y mostrar estados coherentes.

## Task 1: Acceso administrativo y GitFlow

**Files:** `frontend/vite.config.ts`, `frontend/tests/proxy-config.test.mjs`, `frontend/src/product/ProductApp.tsx` si requiere ajuste, `docs/gitflow.md`, `README.md`, `.github/workflows/ci.yml` si las ramas necesitan ajuste.

**Interfaces:** conservar `/api/*`; `/admin/*`, `/static/admin/*` y medios del backoffice deben ser servidos por Django en el mismo origen de desarrollo. Mantener JWT API separado de sesión Django.

- [ ] Reproducir el bucle y registrar causa con evidencia de SPA fallback; crear regresión de rutas proxy y saneamiento.
- [ ] Enrutar backoffice/assets correctamente y evitar redirección autorreferente de React.
- [ ] Documentar GitFlow y bootstrap de develop desde 415f235; verificar que CI cubra feature/develop y PRs.
- [ ] Ejecutar pruebas proxy, frontend lint/tipos/build y confirmar login Django real con cuenta sintética local.
- [ ] Registrar evidencia y commit `fix: corregir acceso al backoffice y adoptar GitFlow`.

## Task 2: Catálogo público configurable

**Files:** crear `backend/providers/catalog.py` y pruebas dedicadas; modificar models/admin/urls, migración nueva, serializadores explícitos y contrato `docs/api.md`/OpenAPI existente. Alinear `docs/plans/03-comercios-colaboradores.md` y documentos de arquitectura/modelo.

**Interfaces:** `GET /api/v1/catalog/config/` -> `{enabled: boolean}`; `GET /api/v1/catalog/benefits/?page=1&search=...&category=...` -> `{count,next,previous,results}` (página 24, máximo 48). DTO beneficio: id, title, description, conditions, valid_from/until, demo, image_url y provider con id, slug, name, category, description, address, hours, contact, map_url, website, demo, image_url. Detalle `GET /api/v1/catalog/benefits/<uuid>/`. Medios independientes con política pública idéntica. No incluir procedencia privada, colaboradores, membresías, QR ni PIN. Catálogo deshabilitado: config 200 false y listados/detalles/medios 404, no-store. Config singleton habilitado por defecto, solo editable por ADMIN superusuario en Django.

- [ ] Escribir y ejecutar regresiones: anónimo ve solo vigentes/publicados; ninguna relación privada; filtros/paginación y métodos de escritura prohibidos; límites inclusivos; toggle cierra todas las URLs; roles no admin no modifican configuración.
- [ ] Implementar política compartida `catalog_benefits()` y switch singleton con restricción DB; medios revalidan en cada petición y no exponen storage directo. No reutilizar serializers con privilegios.
- [ ] Verificar PostgreSQL, Ruff, migraciones y generación OpenAPI sin warnings nuevos; actualizar documentos y datos demo existentes sin regenerar credenciales.
- [ ] Registrar comandos/resultados y commit `feat: publicar catálogo configurable de beneficios vigentes`.

## Task 3: Acreditación sin colaborador

**Files:** `backend/providers/access.py`, `backend/credits/{models,services,serializers,views}.py`, migración nueva y triggers afectados, pruebas de créditos; `docs/plans/04-consumos-creditos.md`, reglas/modelo/API/AGENTS/CONTEXT.

**Interfaces:** consumo recibe `folder_id?: UUID|null`; respuesta e historial tienen `collaborator_id: UUID|null`. Mantener payload previo e idempotencia para referencias existentes. Directo: sin atribución. Referido: `locked_folder_access` dentro de transacción, sin fallback si falla.

- [ ] Escribir pruebas directas, PIN/QR inválido, cliente no verificado, estados/fechas inválidos, catálogo apagado pero QR/PIN válido, referencia inválida no degradable, replay y conflicto de clave entre modos.
- [ ] Probar carrera directa vs referida: una sola Consumption, movimiento y recompensa; no romper carreras/anulaciones previas.
- [ ] Hacer colaborador nullable con migración compatible y conservar triggers de inmutabilidad (comparaciones NULL seguras); no modificar registros históricos ni reglas financieras.
- [ ] Ejecutar suite PostgreSQL/Redis, migraciones/Ruff y regenerar OpenAPI; actualizar reglas y contratos.
- [ ] Registrar evidencia y commit `feat: acreditar consumos sin referencia de colaborador`.

## Task 4: Portada y catálogo del producto definitivo

**Ampliación confirmada:** implementar primero Task 5 (contrato de red) y luego esta tarea, incluyendo la red visual definida en la especificación. El primer intento de Task4 se interrumpió por cuota de herramienta antes de modificar código; no existe entrega frontend que recuperar.

**Files:** `frontend/src/App.tsx`, retirar `frontend/src/prototypes/` y pruebas exclusivas; `frontend/src/product/{ProductApp,PublicPages,types,api-client,...}`; crear módulos de catálogo separados; estilos y pruebas de producto. `frontend/package.json`, docs de frontend/arranque/ToDo y planes futuros.

**Interfaces:** consumir Task 2 sin JWT para datos públicos y Task 3 con sesión para consumo. `/beneficios` catálogo público; `/recomendaciones` carpetas privadas QR; detalle público por beneficio. Mantener `/referencia`, `/consumo`, Mi viaje y flujo QR antes de login. Consume form permite modo directo sin carpeta y referido explícito.

- [ ] Escribir pruebas de portada con ofertas API, carga/vacío/error/deshabilitado, catálogo completo paginado/buscable, detalle/condiciones/demo y referencias privadas separadas.
- [ ] Implementar hero centrado en beneficios activos y CTA claro; mantener fuentes, colores y pasaporte. No hardcodear descuentos ficticios.
- [ ] Incorporar red configurable general/QR con fondo fijo, slots estables, nodos de prestadores únicos y avance automático con pausa, controles, foco/hover/visibility y movimiento reducido. Usar APIs Task5 y fotografías reales documentadas; añadir mapa de Ushuaia y mensaje de programa activo en la ciudad.
- [ ] Retirar prototipos y scripts/pruebas exclusivos, conservar marca/estilos compartidos; ruta antigua no muestra simulación. Actualizar documentación histórica como retirada.
- [ ] Adaptar tipos/UI al colaborador opcional; cliente puede consumir sin QR colaborador. Mantener aislamiento de sesiones, medios privados y respuestas tardías de F2. Las rutas públicas también son navegables con rol ADMIN; la redirección al backoffice se limita al ingreso/área administrativa, sin expulsar al administrador que visita portada o catálogo.
- [ ] Verificar pnpm tests/lint/types/build, backend suite final, QA navegador real admin+anónimo+cliente+toggle y móvil 320px; documentar evidencia y commit en español.
- [ ] Revisión final independiente de rama, push GitFlow/PR contra develop y CI remoto; detenerse sin implementar E5/E6/F3.

## Task 5: Configuración y contrato seguro de la red visual (antes de Task4)

**Files:** `backend/providers/models.py`, `backend/referrals/models.py`, sus migraciones/admin, nuevo módulo de red en providers y tests dedicados, URLs/contrato/contexto. Valores y DTO exactos en ampliación de la spec.

**Interfaces:** dos endpoints de red definidos en spec, paginados por Provider único con al menos un beneficio vigente. `presentation` selecciona únicamente presets; no expone identificadores o datos del colaborador en el público. La red privada usa perfil/autorización actual en cada página, incluidos medios. Configuración por instancia en CatalogConfig y CollaboratorProfile; administrador controla los seis campos y el tamaño/intervalo tienen restricciones PostgreSQL.

- [x] Escribir regresiones: páginas sin duplicados con varias ofertas por negocio, configuración general/colaborador diferente, rechazo de rangos, permisos de edición y privacidad/revocación/toggle en cada página.
- [x] Agregar campos `network_title`, `network_layout`, `network_theme`, `network_background`, `network_page_size`, `network_interval_seconds` con defaults y rangos de spec. No modificar flags, QR ni reglas existentes al migrar.
- [x] Implementar DTO y endpoints con orden estable por nombre/UUID, página limitada por configuración (sin override del cliente), elegir beneficio vigente estable por título/UUID y reusar los serializers de medios apropiados. Catálogo off no afecta red privada autorizada.
- [x] Verificar PostgreSQL/Redis, Ruff, migraciones y OpenAPI sin warnings; actualizar docs y contrato.
- [ ] Registrar commit Conventional en español y revisión independiente antes de Task4.
