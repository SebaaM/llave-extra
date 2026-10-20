# Plan de implementación aprobado

> Corrección vigente del 19/10/2026: catálogo general público con interruptor administrativo, recomendaciones QR privadas y consumos directos sin colaborador. GitFlow obligatorio. [Especificación](07-catalogo-publico-spec.md) y [plan de corrección](07-catalogo-publico-gitflow.md) prevalecen sobre las descripciones históricas siguientes. E5/E6/F3 continúan pendientes; completar esta corrección y detenerse.

> Pedido posterior aprobado: adelantar únicamente los dashboards operativos Prestador/Colaborador de F3. Colaborador elige beneficios concretos del catálogo; usuario Prestador maneja un solo negocio. Admin continúa en Django. [Plan 08](08-backoffice-red.md) y [spec](08-backoffice-red-spec.md) prevalecen en este alcance; tienda y analíticas siguen pendientes.

Estado del plan 08: producto implementado y revisión independiente aprobada en `2405cae`, QA real de ambos roles y móvil completada con límites documentados. [PR #10](https://github.com/SebaaM/llave-extra/pull/10) abierto contra develop, dependiente del #9, sin fusiones. CI de producto `bc36bc0` aprobado (97 backend, 78 UI y 1 proxy); CI del HEAD vigente en el PR. Evidencia en [verificación](../verification/08-backoffice-red.md). Etapa cerrada; detenerse antes de tienda y analíticas.

Objetivo: reconstruir Llave Extra en etapas verificables, con PRs independientes y cuatro roles corregidos. El Cliente es el usuario principal; conserva el identificador técnico `TOURIST` por compatibilidad y no constituye un quinto rol. Colaborador (`COLLABORATOR`), Prestador (`PROVIDER`) y Administrador (`ADMIN`) tienen funciones distintas. El catálogo general muestra beneficios públicos configurables; las carpetas y asignaciones de colaboradores requieren acceso mediante un QR autorizado.

## Restricciones globales

Stack Django/DRF, PostgreSQL, React/TypeScript/Tailwind, Docker; Conventional Commits con texto en español. `.env-example` vacío, secretos locales ignorados. Datos de prueba identificados; documentación breve de arranque y cuentas. Sin merges automáticos. El PIN fijo tiene riesgo residual de compartirse; no equivale a prueba física de consumo.

## Task 1: E1 - Base del proyecto

Crear backend y frontend mínimos, Docker Compose, PostgreSQL, Mailpit, modelo por email inicial, configuración validada, salud, scripts multiplataforma, datos demo iniciales y CI. Verificar migraciones, PostgreSQL real, lint, tipos y build. Instrucciones cortas y contraseñas locales generadas. API aún sin dominio. Archivo: `01-base-proyecto.md`.

## Task 2: E2 - Autenticación y acceso privado

Registro/login/verificación/reset/JWT, sesiones revocables y límites de intentos. Definir roles ADMIN, PROVIDER, COLLABORATOR, TOURIST; el registro público crea únicamente Cliente (`TOURIST`) sin autoasignación de privilegios. Referencias de QR firmado por colaborador, versión y habilitación; carpeta y acceso del Cliente persistido solo al redimir QR válido autenticado. No devolver datos de carpeta a anónimos. Archivo: `02-autenticacion-api.md`.

## Task 3: E3 - Prestadores y carpetas

Prestadores, beneficios, pertenencia de usuario prestador y carpetas curadas por administrador. API filtra cada listado y detalle por acceso activo a la carpeta, pertenencia y estado. Prestador edita solo sus datos; colaborador solo consulta su carpeta y referencias. Cargar inventario de comercios como demo sin confundir ejemplos. Archivo: `03-comercios-colaboradores.md`.

## Task 4: E4 - Consumos y créditos

QR del prestador + PIN fijo hash, email verificado y referencia de carpeta activa cuando se aporta. El consumo directo permite colaborador nulo. Una acreditación de por vida por turista/prestador, idempotencia, transacciones, regla global/per-prestador y snapshot, libro de movimientos, saldo, progreso y ajustes pendientes con bloqueo de canjes. Archivo: `04-consumos-creditos.md`.

## Task 5: E5 - Tienda

Productos demo, stock, pedidos por dinero o créditos, canjes atómicos, reserva monetaria 15 minutos, retiro y cancelación revisada por administrador. Adaptador Mercado Pago Orders API y firma de webhook, idempotencia, tareas recuperables. Pruebas con adaptador simulado claramente identificadas y procedimiento sandbox; no afirmar validación real sin credenciales. Archivo: `05-tienda-pagos.md`.

## Task 6: E6 - Analítica y preparación operativa

Métricas por rol, referencias atribuidas, consumo/crédito/venta derivados del servidor, controles de seguridad, backups/restauración, tareas de reconciliación y documentación. Sin despliegue productivo ni cambio del sitio actual. Archivo: `06-analitica-salida.md`.

## Task 7: F1 - Prototipos de frontend

Etapa histórica: tres opciones React/Tailwind navegables (guía/pasaporte/beneficios), misma identidad y datos mock, usadas para elegir Beneficios como portada y Pasaporte en Mi viaje. La conexión a la API se entregó en F2. El código y las rutas de los prototipos se retiraron en el plan 07; las áreas de Colaborador, Prestador y Administrador conservan permisos propios. Archivo: `frontend.md`.

## Task 8: Herramientas - uv y pnpm

Preferencia confirmada: uv 0.11.3 para backend (Python 3.13, `pyproject.toml`, `uv.lock`, entorno Docker fuera del bind mount y `.venv` nativo opcional ignorado); pnpm 11.22.0 para frontend (versión fijada, `pnpm-lock.yaml` y scripts de compilación autorizados explícitamente). Docker, CI y guías usan instalaciones bloqueadas; `requirements.txt` y `package-lock.json` se retiran como fuentes duplicadas. Los locks originales de pnpm se conservan en el archivo local fechado. Verificar instalaciones limpias, PostgreSQL real, lint/tipos/tests/build y auditoría. Conservar archivos locales existentes. Informe de resultados en `task-8-report.md`.

## Task 9: F2 - Experiencia principal del Cliente

Elección confirmada por el usuario: Beneficios como dirección principal y Pasaporte en Mi viaje. Implementado en la rama F2: hero de valor/propósito, explicación del recorrido turístico, registro/sesión/email, QR privado, beneficios, consumo e historial/progreso conectados a APIs E2–E4, JWT en memoria, medios autorizados y módulos de producto acotados. No publica carpetas ni acuerdos no confirmados. Suite UI/API cliente aprobada localmente; revisión visual de escritorio por controlador pasó y revisión móvil/flujo real queda asentada en el informe de etapa. F2 depende de E2–E4 y no de la tienda ni de la analítica; E5 y E6 siguen antes de F3. Detalle en [plan frontend](frontend.md) e [informe Task 9](../../.superpowers/sdd/00-roadmap/task-9-report.md).

## Task 10: F3 - Tienda y espacios de la red

Completar tienda ARS o créditos y pedidos propios sobre servicios transaccionales, panel Prestador de propuestas/ofertas propias, panel Colaborador de recomendaciones/QR/métricas y acceso administrativo al backoffice existente. El servidor sigue siendo autoridad de permisos, stock, pagos y créditos. Verificar límites por rol, reintentos/errores y flujo real de canje demo; declarar sandbox externo pendiente si faltan credenciales. PR propio después de F2. Detalle en plan frontend.

## Orden de integración y GitFlow

E1 -> E2 -> E3 -> E4 -> F2 -> E5 -> E6 -> F3. F1 compartió base y contratos y permitió avanzar backend mientras se elegía el diseño. Hubo un primer commit documental en main y PRs históricos apilados. Desde la corrección del 19/10/2026 se usa GitFlow obligatorio: `main` estable, `develop` de integración y ramas `feature/*`, `release/*`, `hotfix/*`. El PR de esta corrección se dirige a `develop`, inicializado en la base revisada `415f235`; se conservan los PRs históricos. Pruebas y revisión antes de publicar cada PR; no fusionar desde este trabajo. Ver [flujo vigente](../gitflow.md).

La integración histórica de F1 y la migración de herramientas a uv 0.11.3 y pnpm 11.22.0 precedieron a E4. F2 usó la elección Beneficios + Pasaporte después de E4 revisado; E5 y E6 siguen pendientes, y F3 viene después de F2 y E6. Esto no cambia los cuatro roles persistidos.

## Cierre de etapa

Requisitos implementados y comprobados, registro de pruebas, revisión independiente, contexto/ToDo actualizados y PR adjunto al chat. Cualquier limitación externa queda declarada en el PR. Docker real es requisito para declarar pruebas PostgreSQL completas.
