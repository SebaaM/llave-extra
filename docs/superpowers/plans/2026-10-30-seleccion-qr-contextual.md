# Implementación de selección contextual por QR

Ejecución con subagentes acotados y revisión independiente por tarea, sin delegación secundaria. Comenzó en `feature/frontend-cliente-visual`; tras detectar PR #16 ya fusionada el 31/10, continúa en `feature/cliente-qr-destacados`, con nueva PR en borrador hacia develop y sin merge.

**Objetivo:** catálogo normal sin recomendaciones permanentes; selección del colaborador visible después de login desde su QR, vínculo registrado, atribución de consumo y QR estable renovable manualmente.

**Diseño:** [flujo precisado por el usuario](../specs/2026-10-30-seleccion-qr-contextual.md).

## Restricciones y decisiones

- Conservar `FolderAccess` como vínculo/autorización histórica; no copiar beneficios al turista. `FolderBenefit` sigue siendo la selección canónica vigente.
- QR del negocio + PIN, E4, idempotencia de consumo, atribución y reglas de créditos intactos. Referencia inválida nunca degrada a directo.
- Contexto QR del Cliente en memoria y pista mínima en sessionStorage por pestaña (solo ID de cuenta/colaborador, sin nombre, QR, URL ni secretos), revalidada en servidor: se limpia al cambiar QR/cuenta o cerrar sesión, y nunca se reconstruye una colección a partir de accesos históricos.
- QR y medios privados revalidan cuenta/rol/perfil/versión; no usar medios públicos como alternativa. DTO de nombre no usa correo.
- GET no modifica credenciales. Emisión QR estable por perfil/versión, compatible con QR anteriores hasta rotación; no renovar automáticamente ni al editar beneficios.
- Renovación propia usa un receipt/auditoría específico en referrals para no abrir ni modificar el motor de comandos ADMIN. Decisión del orquestador: una tabla nueva, aislada y sin QR/URL/PIN, evita ampliar permisos de `administration.run_command`. El costo es una migración y un registro de cada renovación exitosa.
- Resumen acotado en ficha Admin del colaborador: clientes distintos vinculados y visitas válidas atribuidas, sin conteo de escaneos ni E6 general.
- Todo en español; sin secretos versionados, nuevas dependencias, SQLite o cambios en datos reales.

## A — Lecturas autenticadas y resumen

Archivos: referrals/views y serializadores de respuesta; providers/views o módulo enfocado, serializers y urls; administration/summary y urls; pruebas backend y docs/api.md.

Contratos:

- `POST /api/v1/referrals/redeem/` mantiene request `{token}` y agrega `collaborator_name` al resultado existente `{collaborator_id,granted_at}`. Nombre de User.get_full_name().strip() o alternativa neutra, nunca email.
- `GET /api/v1/folders/{folder_id}/benefits/?page=1&page_size=24`: 24 por defecto, máximo 48, `{count,next,previous,collaborator:{id,name},results:[BenefitRead + provider:ProviderRead]}`. Serializadores privados con `folder_id` para URLs de medios; consulta seleccionada vigente, orden provider.name/title/pk y select_related provider, recheck de acceso antes de salida. Sin filtros/categorías nuevos.
- `GET /api/v1/admin/collaborators/{id}/summary/`: `{collaborator_id,linked_clients,valid_attributed_consumptions}`. `linked_clients` cuenta tourist_id distintos de FolderAccess histórico; visitas cuentan Consumption con ese colaborador y state VALID. Gate activo ADMIN+staff+superuser, no JOIN multiplicativo, no PII ni secretos.

- [x] Pruebas RED: anónimo/otros roles rechazados, QR/grant ajeno o revocado, nombre vacío sin email, múltiples beneficios del mismo negocio/más de una página, no herencia de ofertas hermanas y medios privados.
- [x] Implementar contratos mínimos, OpenAPI y documentación; catálogo público y consumo sin cambios.
- [x] Probar resumen con grants de varias versiones, usuarios distintos y consumos directos/válidos/anulados; cero y permisos Admin. PostgreSQL/Redis, Ruff, esquema y drift de migraciones.
- [x] Revisión independiente y commit.

## B — QR estable y renovación propia

Archivos: referrals/access.py, servicio de credencial enfocado, modelos/migración de receipt, views/urls/serializers, pruebas y docs/api.md.

Contratos:

- `sign_qr` emite formato determinista nuevo con prefijo y salt propios, `Signer` sin timestamp y carga canónica `{id,v}`. Parser dual estricto para nuevo formato y legacy `TimestampSigner`, sin cambiar versiones al desplegar.
- `GET /collaborator/qr/` agrega `version` no secreta para precondición; URL y PNG estables con misma configuración/perfil/versión.
- `POST /collaborator/qr/renew/` recibe solo `{version}` e `Idempotency-Key`. Solo Colaborador activo/habilitado sobre su perfil obtenido por servidor. Locks User titular → perfil con OF self; recheck de propietario/rol/habilitación/versión, incremento único y receipt/auditoría atómica. Replay exige permisos vigentes y devuelve `{id,status:'renewed',version}` sin QR/URL; nueva lectura GET obtiene QR actual.
- Receipt propio con unicidad actor/clave, digest de cuerpo, versiones anterior/nueva y respuesta saneada o campos equivalentes; sin secretos. Cambios de selección no entran al digest de credencial. No alterar comandos/permisos administrativos existentes.

- [x] RED y pruebas PG: estabilidad al avanzar reloj/GET/PNG/editar selección, compatibilidad legacy, firmas inválidas y rechazo de otro salt; renovación invalida códigos y accesos antiguos conservando historia.
- [x] Probar permisos/propiedad, replay mismo cuerpo, clave reutilizada distinta, dos claves con misma versión y concurrencia. Sin QR en receipt/auditoría.
- [x] Implementar y verificar PostgreSQL/Redis, Ruff/OpenAPI/migraciones, revisión independiente y commit.

## C — Experiencia contextual y backoffice

Se ejecuta en dos cortes revisables: C1 contexto/navegación/consumo y C2 espacio QR/resumen Admin. C2 comienza tras la revisión de C1 para no mezclar commits ni modificaciones compartidas.

Archivos: ProductApp/ReferencePage, nuevo QrSelection, navegación/Layout, ConsumptionPage, WorkspaceQR, nueva tarjeta Admin summary, textos y pruebas correspondientes. Retomar cambios frontend no commiteados del retiro de sección permanente; no restaurar colecciones históricas ni probes para un enlace de menú.

- [x] Implementar un único coordinador de redención automática/manual con cercas token/cuenta/sesión/solicitud. Tras login y redeem guardar contexto `{collaborator_id,collaborator_name}` en memoria, con pista mínima por pestaña para sobrevivir la recarga por QR de negocio, y cargar selección paginada privada bajo `/referencia`, título «Recomendaciones de …». QR nuevo sustituye contexto y limpia respuestas/blobs antiguos; errores/revocación no muestran selección anterior. Sin recomendaciones en navbar ni barra.
- [x] Tarjetas privadas con negocio/beneficio/condiciones; no usar BenefitCard con transporte público ni catálogo como fallback privado. Consumo recibe referencia explícita del contexto actual, conserva QR del negocio+PIN y reintentos; no elige un grant histórico.
- [x] Mostrar resumen de dos cifras en ficha Admin con carga/error/reintento y guardas de cuenta/ruta; no iniciar dashboard analítico general.
- [x] Workspace colaborador distingue consultar/copiar/descargar de renovar. Renovación manual explícita explica invalidez anterior, preserva clave/cuerpo ante incertidumbre, bloquea acciones y obtiene QR/PNG autoritativos tras éxito; revoca blobs anteriores. No tocar PIN/QR del Prestador.
- [x] RED/GREEN y regresiones de QR/login/cambio cuenta/nuevo QR/revocación/consumo y renovación incierta. Suite frontend, lint/tipos/build; revisión independiente y commit.

## D — Cierre

- [x] Revisión integral realizada, una onda de correcciones y re-review; suites PG/Redis y frontend, esquema/Ruff/drift y HTTP sintético registrados en la evidencia. Queda un residual Important antes del merge: 404 de página retirada seguido de 503/red borra la pista; QA visual manual pendiente. No se declara revisión limpia.
- [x] Actualizar CONTEXT/AGENTS/ToDo/roadmap/API y evidencia antes/después; retiro de la sección permanente cubierto por pruebas de contexto QR.
- [x] Publicar [PR #18](https://github.com/SebaaM/llave-extra/pull/18) de `feature/cliente-qr-destacados` hacia `develop` en borrador; sin merge y con límites de QA/CI reales. PR #16 ya fue integrada externamente.
- [ ] Resolver el residual de continuidad, completar QA visual y obtener aprobación antes del merge.
