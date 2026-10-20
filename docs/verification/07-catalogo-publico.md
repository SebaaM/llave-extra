# Verificación de catálogo, red visual y GitFlow

Fecha: 19-10-2026. Implementación de producto hasta `2dd1c7e`; base revisada `415f235`. Rama `feature/catalogo-publico-admin`, destino `develop`. Entrega en el [PR #9](https://github.com/SebaaM/llave-extra/pull/9), sin fusionar. El estado remoto vigente se consulta en sus [comprobaciones de CI](https://github.com/SebaaM/llave-extra/pull/9/checks).

## Alcance entregado

Backoffice Django accesible mediante el proxy local; catálogo general público de beneficios publicados y vigentes con interruptor administrativo; recomendaciones privadas independientes por QR; consumo directo con colaborador nulo y consumo referido estricto. La portada usa ofertas de la API, fotografías reales, red de prestadores y mapa de Ushuaia. Se conserva el pasaporte de Mi viaje y se retiran los prototipos F1.

La red general y cada colaborador tienen título, distribución, tema, fondo, tamaño de página e intervalo propios. Solo el administrador cambia esos valores. Los presets no permiten CSS, HTML ni URLs arbitrarios. Cada página privada revalida perfil, QR vigente y pertenencia; deshabilitar el catálogo solo cierra su superficie pública.

El administrador usa nombres de aplicaciones, modelos, campos, columnas, opciones y acciones en español mediante metadatos de Django. `TOURIST` se presenta como Cliente y conserva su valor técnico. La revisión de `sqlmigrate` de accounts0004, credits0009, providers0005 y referrals0004 confirmó solo comentarios/transacciones, sin cambios SQL de tablas o columnas; después se registraron esas migraciones en el entorno principal. La suite PostgreSQL/Redis volvió a pasar 82/82 y Ruff, migraciones/OpenAPI pasaron tras la traducción. QA real confirmó índice, listado y formulario de Prestador. Los textos capturados previamente en el historial de auditoría conservan su representación original.

## Comprobaciones automáticas

| Comando | Resultado de implementación |
| --- | --- |
| `docker compose -p llaveextra-acceptance8 run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend uv run --locked pytest -q` | 82/82, PostgreSQL y Redis reales |
| Mismo entorno, `pytest -q providers/tests/test_seed_demo_media.py` | 2/2: repetición, imágenes editadas y registros reales preservados |
| Mismo entorno, `uv run --locked ruff check .` | Sin errores |
| Mismo entorno, `python manage.py makemigrations --check --dry-run` | Sin cambios pendientes |
| Mismo entorno, `python manage.py spectacular --file /tmp/task4-openapi.yaml --validate` | Exit 0, sin advertencias |
| `pnpm run test` en frontend | Vitest 32/32 y proxy 1/1 después del arreglo de pausa |
| `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` | Exit 0 |
| `docker compose build frontend` y `docker compose up -d --no-deps frontend` | Imagen final reconstruida y servicio recreado |

Se observaron timeouts bajo carga concurrente local; los mismos casos pasaron en serie sin ampliar tiempos. Vitest usa un worker y archivos secuenciales. La verificación final ejecutó `pnpm run test` en solitario y pasó 32/32, además del proxy. La suite incluye catálogo sin JWT, cierre por configuración, búsqueda/paginación, estados vacío/error, red de 30 prestadores, última página incompleta, distribución de redes pequeñas y controles de avance/pausa. En el arreglo final, lint, tipos y build también terminaron con exit 0.

No se presenta la adición de todas las regresiones como un ciclo TDD previo: algunas se incorporaron durante la implementación. Las verificaciones anteriores son ejecuciones completas posteriores al cambio.

## Revisión independiente y corrección final

Las tareas de proxy, catálogo público, consumos directos y contrato de red obtuvieron aprobación independiente. La revisión integrada de `415f235..d21554b` aprobó la traducción administrativa y detectó un hallazgo Important en la pausa de la red: foco y hover compartían un estado, de modo que salir con el puntero podía reanudar la paginación y retirar el nodo enfocado.

`2dd1c7e` separó ambos estados y agregó dos regresiones con rojo previo y verde posterior. Una reproducción independiente del componente real confirmó ambos órdenes: el temporizador permanece detenido mientras persiste cualquiera de foco o hover y se programa de nuevo solo al terminar ambos. La re-revisión focal aprobó Task 4, conservó la aprobación de Task 6 y emitió **Whole-branch quality: Approved**, sin Critical ni Important pendientes ni hallazgos nuevos. No duplicó las suites completas. Los dos hallazgos menores de etapas previas se conservan en los límites siguientes.

El [CI del PR sobre `2dd1c7e`](https://github.com/SebaaM/llave-extra/actions/runs/39320761846) terminó con backend y frontend en **success**. Se inspeccionaron los logs: 82 pruebas PostgreSQL/Redis, 32 Vitest y proxy sin fallos; Ruff y control de migraciones correctos, build completo y auditoría sin vulnerabilidades conocidas. El commit posterior de cierre solo actualiza documentación. El resultado del HEAD vigente se consulta en las comprobaciones del PR, sin confundirlo con este registro histórico.

## Navegador y base local

- El ingreso administrativo real con sesión y CSRF llegó al backoffice. Una sesión API ADMIN pudo permanecer en portada, catálogo, búsqueda y detalle público.
- Un Cliente sintético verificado entró por QR de prestador antes del login. La intención sobrevivió al ingreso; acreditó sin carpeta. Mi viaje mostró una visita de cinco y 1.000 créditos. Una consulta PostgreSQL confirmó exactamente un consumo, colaborador nulo, recompensa igual al saldo y cero referencias en ese momento.
- Después de redimir un QR colaborador, el Cliente recargó sus recomendaciones con el catálogo apagado y pudo consultar red, prestador y condiciones privadas. El catálogo general mostró su estado deshabilitado. El interruptor se restauró a habilitado.
- Una presentación ORBIT/OCEAN/BEAGLE y título propio se guardó en el perfil sintético. La presentación general conservó RADIAL/SAND/HARBOR y su título, con 12 prestadores por página y 10 segundos. El formulario rechazó un tamaño de página de nueve.
- Tras cargar la fotografía pública de Kuar, apagar el catálogo retiró el detalle y su fotografía. La URL directa del medio devolvió 404 con `Cache-Control: no-store`. Se restauró el interruptor.
- Se revisaron escritorio y viewport de 320 píxeles. El documento no desborda horizontalmente; registro e ingreso no se superponen con la navegación; el hero muestra una condición real antes del CTA. Fotografías comerciales verificadas de 1280 y 2384 píxeles cargaron, junto con ciudad, logos y mapa con atribución. Se restableció el viewport.
- Se despublicaron únicamente los dos locales sintéticos creados por el orquestador durante QA. Sus cuentas, referencias, consumos y créditos permanecen. Los seis prestadores históricos publicados siguen identificados como demo.

Las capturas locales ignoradas son `work/frontend-portada-1910.jpg`, `work/frontend-red-1910.jpg`, `work/frontend-movil-1910.jpg` y `work/admin-espanol-1910.jpg`. Las fotografías, fuentes y atribuciones se documentan en [assets](../assets.md). La carga `seed_demo_media` agregó ocho medios en campos demo vacíos, sin rotar credenciales ni sobrescribir ediciones.

## Límites de esta verificación

El conjunto local tiene seis prestadores activos: el avance entre varias páginas se comprobó con pruebas de componente y API de 30 prestadores, no con una segunda página del catálogo local. Los medios privados tienen cobertura de autorización en PostgreSQL; no se afirma una comprobación visual privada de fotografía. Auto-review rechazó el intento opcional de agregar otro prestador a la carpeta sintética por considerarlo ampliación persistente de acceso; no se ejecutó ni se reintentó. Se conservaron las asignaciones existentes.

La eliminación del singleton fuera de Django Admin queda como defensa adicional para una etapa operativa: el acceso actual lo recrea habilitado. El admin normal impide borrarlo. La prueba de inmutabilidad NULL no distingue por sí sola una transición auditada de anulación, aunque el trigger vigente usa `IS DISTINCT FROM`; las carreras y anulaciones están cubiertas por la suite financiera.

## Decisiones de integración

| Decisión | Motivo y coste de cambiarla |
| --- | --- |
| Inicializar `develop` en `415f235` y conservar los PR históricos | Es la base revisada de E4/F2. Usar otra base requiere reubicar la integración antes de una release; no se fusionaron PRs. |
| Catálogo anónimo; interruptor solo público | Permite promocionar beneficios y conserva recomendaciones/consumos. Exigir login para consultar requiere ajustar permisos y navegación. |
| Acreditar solo con una oferta publicada y vigente | Mantiene coherencia entre beneficio y recompensa. Premiar visitas sin oferta activa exige un cambio explícito de elegibilidad y sus pruebas; el replay confirmado conserva su resultado. |
| Presentación mediante presets administrados | Mantiene el control de habilitación/configuración y limita entradas. Dar edición estética al colaborador requiere permiso y formulario propios. |
| Ciudad pública con atribución; comercios en storage protegido y semillas demo | Evita rutas estáticas que eludan autorización. Material comercial definitivo debe confirmarse o reemplazarse con cada prestador antes de producción. |
| Slots según `min(page_size, count total)` | Distribuye redes pequeñas por todo el tablero y mantiene posiciones entre páginas. Si cambia el total al revalidar, puede cambiar la distribución; el fondo permanece fijo. |

E5 (tienda/pagos), E6 (analítica/operación) y F3 (paneles completos) continúan pendientes. No se validaron pagos externos ni se desplegó el sitio público.
