# Verificación del backoffice operativo de la red

Estado: implementación, QA y revisión independiente aprobados sobre `2405cae`; publicación del PR y CI pendientes. Spec y plan: `docs/plans/08-backoffice-red-spec.md` y `docs/plans/08-backoffice-red.md`. Base revisada `95b9953`, plan inicial `1c3a612`, rama `feature/backoffice-red`. El PR propio tendrá base develop y dependencia del PR #9, sin merges desde este trabajo.

## Alcance confirmado

Dashboards con barra lateral para Prestador y Colaborador, datos operativos propios, Admin Django y analíticas posteriores. Usuario Prestador administra un único negocio. Colaborador habilitado agrega/quita selecciones concretas del catálogo: la selección de una oferta no habilita otras del mismo negocio. Cliente conserva su experiencia principal y las referencias vigentes por QR.

El preflight de PostgreSQL principal encontró cero usuarios con múltiples negocios y diez asociaciones históricas por prestador. La activación temporal anterior de once beneficios demo se conserva; QA de edición no debe retirar esas ofertas históricas.

## Decisiones y consecuencias

| Decisión | Motivo y coste de cambiarla |
| --- | --- |
| Adelantar solo F3 operativo | El usuario pidió paneles ahora y analíticas después. Tienda y métricas necesitan sus etapas propias. |
| Conservar FolderProvider histórico y migrar solo ofertas publicadas/vigentes del momento a FolderBenefit | Preserva relaciones sin heredar ofertas futuras. Borradores históricos o negocios sin oferta necesitarán selección explícita al publicarse. |
| Un negocio por usuario, sin exclusividad inversa | La regla limita lo que administra cada cuenta. Exigir un único usuario por negocio requiere otra restricción y revisión de datos. |
| Feature basada en95b9953, dependiente del PR #9; nuevo PR contra develop | Mantiene el catálogo actual sin fusionar entregas. Mientras #9 siga pendiente, su dependencia debe revisarse primero antes de release. |
| Selector de catálogo privado del Colaborador independiente del interruptor público | El interruptor solo cierra lo público. Cerrar el selector interno requiere una regla adicional. |
| Permitir quitar selecciones propias, incluidas las migradas | Permite corregir la propia selección y conserva historial financiero. Recomendaciones obligatorias fijadas por Admin requerirían distinguir origen y permisos. |

## Gates de entrega

- [x] Backend y revisión independiente; corrección de concurrencia aprobada.
- [x] Frontend, pruebas/lint/tipos/build y revisión integrada, incluidos los ajustes de denegación y tacto.
- [x] Migración local después del gate backend; QA real de ambos roles y viewport320, con los límites manuales descritos abajo.
- [ ] PR y CI del HEAD final. No hay pagos, analíticas ni despliegue productivo en este alcance.

## Backend — evidencia de Task 1

Commit `e7feae7`, respecto de `1c3a612`. El orquestador leyó el informe, los logs completos y verificó `git diff --check`. Esta es la evidencia inicial; la revisión y su corrección se detallan después.

Entorno aislado `llaveextra-acceptance8`, PostgreSQL y Redis reales. Prefijo de los comandos: `docker compose -p llaveextra-acceptance8 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend`.

| Comando | Resultado |
| --- | --- |
| `uv run --locked pytest -q` | 96 aprobadas en 52,14 s |
| `uv run --locked ruff check .` | All checks passed, exit 0 |
| `uv run --locked python manage.py makemigrations --check --dry-run` | No changes detected, exit 0 |
| `uv run --locked python manage.py spectacular --file /tmp/llave-extra-openapi.yaml --validate --fail-on-warn` | exit 0, sin advertencias |
| Regresión PNG propio | 1 aprobada en 8,46 s después de retirar dependencia del timestamp firmado |
| Regresiones finales de medios privados y permiso administrativo | 2 aprobadas en 7,20 s |

La suite inicial incorpora 14 casos nuevos: selección concreta frente a ofertas hermanas/futuras, DTO seguro, roles y propiedad, revocación, catálogo privado con interruptor público apagado, duplicados y concurrencia, migración conservadora, negocio único, PNG y borrado protegido. En esa ejecución no se había migrado la base principal y no se alteraron credenciales ni QR para las pruebas.

### Revisión y corrección de concurrencia

La revisión independiente de `e7feae7` detectó un Important/P2: el borrado masivo de recomendaciones en Admin (`select_across=1`) podía incorporar una selección de otro perfil entre dos consultas y adquirir su perfil después de bloquear el prestador. Una reproducción focal sobre PostgreSQL confirmó un deadlock real. No hubo corrupción: PostgreSQL abortó una transacción, pero una escritura podía fallar con 500.

Corregido en `26458f2`: captura única de PK/perfil/beneficio/prestador, todos los locks derivados de esa captura y borrado exclusivo de los PK originales. La regresión permanente falló en el código anterior con `deadlock detected` (12,50 s); con el ajuste pasaron las 15 pruebas de recomendaciones en 26,20 s y Ruff afectado. No se amplió el tiempo de espera. Revisión focal: **I1 ADDRESSED, Spec aprobada y calidad Approved**, cero hallazgos nuevos ni pendientes.

### Aplicación local después de la aprobación

`docker compose -p llaveextra exec -T backend uv run --locked python manage.py migrate --noinput` aplicó `providers.0006_folder_benefit_and_unique_business` con resultado OK. La consulta posterior de solo lectura verificó diez asociaciones históricas conservadas, ocho selecciones migradas, cero cuentas con múltiples negocios y once beneficios públicos, todos demo. No se cambiaron claves, QR, ofertas publicadas ni asociaciones históricas para esta aplicación.

## Frontend — implementación y revisión

`90c1c54` entrega paneles por rol, shell lateral responsive, formularios propios, catálogo privado de selección y QR/PNG autorizados. El informe del implementador registra `docker compose exec frontend pnpm test` con 62/62 UI y 1/1 proxy; `pnpm lint`, `pnpm typecheck`, `pnpm build` y `git diff --cached --check` terminaron con exit 0. Las comprobaciones fueron secuenciales y no se ampliaron timeouts. Las pruebas UI usan fetch simulado; QA real se registra aparte.

La revisión integrada reprodujo un Important de limpieza de 401: tras rechazo del PNG o una mutación y refresh fallido quedaban un enlace QR o recomendaciones antiguas en pantalla. También identificó una ruta de referencia que permitía intentar el POST exclusivo del Cliente desde otros roles (servidor 403, sin bypass de permisos). El modelo revisor agotó su cuota antes de terminar el informe; se conservaron las reproducciones y otra revisión independiente completó el contraste después de las correcciones.

Corrección en `977795a`: los rechazos 401/403 cierran QR y datos privados del Colaborador y se propagan también desde ficha, ofertas, eliminación y PIN del Prestador. Se conserva el desmontaje de Blob y el aislamiento por versión/montaje. La referencia permanece disponible para anónimo/Cliente; los otros tres roles reciben explicación sin formulario de vinculación. Regresiones focales 36/36, suite de esa versión 71/71 UI más proxy 1/1; lint, tipos, build y diff check con exit 0. Un intento previo tuvo una espera transitoria fallida en una prueba histórica de red; repetición y ejecución definitiva pasaron sin ampliar timeouts.

La revisión completa de `977795a` confirmó residuales de I2 en errores 401/403 de fotos y del GET de credencial, y un Minor de tamaño táctil del enlace de edición. Se corrigieron juntos en `2405cae`: callback de denegación opcional en fotos del workspace, cierre del QR por error de credencial y enlace con clase de botón. Un 404 de imagen conserva el marcador alternativo y la vista; un error tardío de otra sesión no cierra la cuenta actual. El PIN escrito durante un GET pendiente se desmonta ante denegación.

Comprobaciones de la ronda: 44/44 focales, 78/78 Vitest y proxy 1/1, lint/tipos/build/diff checks exit 0. El orquestador ejecutó además `docker compose -p llaveextra exec -T frontend pnpm test` sobre `2405cae` para resolver una discrepancia del informe: **78 Vitest en siete archivos (29,68 s) más 1 proxy**, exit 0. El informe del implementador se corrigió a ese conteo; no son 77 pruebas UI. Revisión focal final: **Spec aprobada y calidad Approved**, I2 A/B y M2 resueltos, sin roturas nuevas ni hallazgos de producto pendientes. M1 ya había quedado resuelto en la revisión completa.

## QA real — navegador contra Django y PostgreSQL

- Cuenta demo Prestador: login lleva a `/prestador`; resumen de único negocio y contadores reales, ficha con nombre/categoría de gestión administrativa, ruta `/colaborador` denegada y vuelta al panel propio.
- Alta de `QA backoffice · borrador sintético 19/10`: fechas invertidas devuelven validación legible; corregidas, permite guardar y editar como borrador pendiente de revisión. Queda identificado en el entorno local para pruebas; no se publicó ni se editaron las once ofertas históricas.
- A 320 px: ficha sin overflow horizontal, controles inspeccionados de al menos 44 px, menú se abre y se cierra al navegar a cuenta. Escritorio verificado a 1280 px. El ancho de contenido descuenta la barra de desplazamiento nativa.
- QR Prestador sin configurar muestra instrucción de crear PIN; campo vacío, password, mínimo 6 y máximo 12. No se cambió ninguna credencial desde navegador. La generación del PNG configurado se cubre con PostgreSQL/UI automatizadas, no con esta cuenta real sin PIN.
- Logout devuelve a portada y retira panel; una nueva entrada a `/prestador` sin sesión exige ingreso.

El selector de archivos del controlador se prolongó y la actualización del frontend desmontó el formulario durante el intento. No se declara subida de imagen validada de extremo a extremo en navegador; multipart y medios sí tienen cobertura automatizada. Capturas locales ignoradas en `work/backoffice-prestador*.png`, sin QR ni PIN.

- Cuenta demo Colaborador: login lleva a `/colaborador`, muestra seis selecciones disponibles propias. Búsqueda privada «Tiger» devuelve una sola oferta vigente y excluye el borrador QA. Agregar muestra confirmación y botón «Ya está en tu carpeta» deshabilitado; Mis recomendaciones muestra siete tarjetas, una sola de Tiger y ninguna del borrador. Quitar esa tarjeta devuelve confirmación y restaura las seis selecciones originales. No se cambiaron carpetas ajenas ni habilitaciones administrativas.
- QR Colaborador: imagen privada cargada correctamente y acciones de copiar/descargar presentes. Se inspeccionó su carga sin capturar código ni enlace privado. No se accionó copiar/descargar en este QA; estas operaciones tienen pruebas UI. A 320 px, imagen de 229 px y ancho documental igual al ancho útil, sin overflow. Resumen y menú móvil verificados; capturas de resumen sin QR en `work/backoffice-colaborador*.png`.
- La portada sigue accesible con rol Colaborador y ofrece «Mi espacio», que resuelve a `/colaborador`. El ingreso permanece accesible para cambiar de cuenta; al enviar el formulario se retira la identidad anterior antes de esperar la respuesta.
- Login API con cuenta demo ADMIN navegó realmente a `/admin/`, donde cargó el índice español de Django con su sesión administrativa preexistente e independiente. No hubo bucle React/Admin. Esto verifica el cambio de documento y la convivencia de sesiones; no se afirma haber creado una sesión Django nueva con el JWT.
- Después de la corrección, `/referencia` con sesión ADMIN muestra «Ingresá como Cliente» y no presenta campo de token ni botón de vinculación. Los otros roles y el uso anónimo/Cliente se verifican además en regresiones UI.
- Consulta final de solo lectura en PostgreSQL: diez asociaciones históricas, ocho selecciones (igual que tras migrar), once beneficios públicos demo, un borrador QA demo y cero resultados públicos para ese borrador.
- Verificación real de M2 después del ajuste: a 320 px, «Editar información →» mide 44 px de alto y 176,34 px de ancho; ancho útil y scroll documental de 305 px, sin overflow. Se restableció el viewport y se conservó el panel Prestador abierto. Captura de resumen Colaborador guardada y revisada sin códigos privados: `work/backoffice-colaborador-final.jpg`.
