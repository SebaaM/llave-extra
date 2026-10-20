# Plan de implementación aprobado

Objetivo: reconstruir Llave Extra en etapas verificables, con PRs independientes y cuatro roles corregidos. El Cliente es el usuario principal; conserva el identificador técnico `TOURIST` por compatibilidad y no constituye un quinto rol. Colaborador (`COLLABORATOR`), Prestador (`PROVIDER`) y Administrador (`ADMIN`) tienen funciones distintas. La aplicación no publica las carpetas de colaboradores ni sus prestadores sin acceso a través de un QR autorizado.

## Restricciones globales

Stack Django/DRF, PostgreSQL, React/TypeScript/Tailwind, Docker; Conventional Commits con texto en español. `.env-example` vacío, secretos locales ignorados. Datos de prueba identificados; documentación breve de arranque y cuentas. Sin merges automáticos. El PIN fijo tiene riesgo residual de compartirse; no equivale a prueba física de consumo.

## Task 1: E1 - Base del proyecto

Crear backend y frontend mínimos, Docker Compose, PostgreSQL, Mailpit, modelo por email inicial, configuración validada, salud, scripts multiplataforma, datos demo iniciales y CI. Verificar migraciones, PostgreSQL real, lint, tipos y build. Instrucciones cortas y contraseñas locales generadas. API aún sin dominio. Archivo: `01-base-proyecto.md`.

## Task 2: E2 - Autenticación y acceso privado

Registro/login/verificación/reset/JWT, sesiones revocables y límites de intentos. Definir roles ADMIN, PROVIDER, COLLABORATOR, TOURIST; el registro público crea únicamente Cliente (`TOURIST`) sin autoasignación de privilegios. Referencias de QR firmado por colaborador, versión y habilitación; carpeta y acceso del Cliente persistido solo al redimir QR válido autenticado. No devolver datos de carpeta a anónimos. Archivo: `02-autenticacion-api.md`.

## Task 3: E3 - Prestadores y carpetas

Prestadores, beneficios, pertenencia de usuario prestador y carpetas curadas por administrador. API filtra cada listado y detalle por acceso activo a la carpeta, pertenencia y estado. Prestador edita solo sus datos; colaborador solo consulta su carpeta y referencias. Cargar inventario de comercios como demo sin confundir ejemplos. Archivo: `03-comercios-colaboradores.md`.

## Task 4: E4 - Consumos y créditos

QR del prestador + PIN fijo hash, email verificado y referencia de carpeta activa. Una acreditación de por vida por turista/prestador, idempotencia, transacciones, regla global/per-prestador y snapshot, libro de movimientos, saldo, progreso y ajustes pendientes con bloqueo de canjes. Archivo: `04-consumos-creditos.md`.

## Task 5: E5 - Tienda

Productos demo, stock, pedidos por dinero o créditos, canjes atómicos, reserva monetaria 15 minutos, retiro y cancelación revisada por administrador. Adaptador Mercado Pago Orders API y firma de webhook, idempotencia, tareas recuperables. Pruebas con adaptador simulado claramente identificadas y procedimiento sandbox; no afirmar validación real sin credenciales. Archivo: `05-tienda-pagos.md`.

## Task 6: E6 - Analítica y preparación operativa

Métricas por rol, referencias atribuidas, consumo/crédito/venta derivados del servidor, controles de seguridad, backups/restauración, tareas de reconciliación y documentación. Sin despliegue productivo ni cambio del sitio actual. Archivo: `06-analitica-salida.md`.

## Task 7: F1 - Prototipos de frontend

Tres opciones React/Tailwind navegables (guía/pasaporte/beneficios), misma identidad y datos mock, landing pública y carpeta privada tras simulación de acceso por QR. Registro/login/ficha/progreso. La experiencia del Cliente es principal; las áreas de Colaborador, Prestador y Administrador usan permisos y accesos propios. Los tres prototipos están integrados como demostración. La elección posterior del usuario es Beneficios como portada y Pasaporte en Mi viaje; la conexión a la API pertenece a F2. Archivo: `frontend.md`.

## Task 8: Herramientas - uv y pnpm

Preferencia confirmada: uv 0.11.3 para backend (Python 3.13, `pyproject.toml`, `uv.lock`, entorno Docker fuera del bind mount y `.venv` nativo opcional ignorado); pnpm 11.22.0 para frontend (versión fijada, `pnpm-lock.yaml` y scripts de compilación autorizados explícitamente). Docker, CI y guías usan instalaciones bloqueadas; `requirements.txt` y `package-lock.json` se retiran como fuentes duplicadas. Los locks originales de pnpm se conservan en el archivo local fechado. Verificar instalaciones limpias, PostgreSQL real, lint/tipos/tests/build y auditoría. Conservar archivos locales existentes. Informe de resultados en `task-8-report.md`.

## Task 9: F2 - Experiencia principal del Cliente

Elección confirmada por el usuario: Beneficios como dirección principal y Pasaporte en Mi viaje. Implementado en la rama F2: hero de valor/propósito, explicación del recorrido turístico, registro/sesión/email, QR privado, beneficios, consumo e historial/progreso conectados a APIs E2–E4, JWT en memoria, medios autorizados y módulos de producto acotados. No publica carpetas ni acuerdos no confirmados. Suite UI/API cliente aprobada localmente; revisión visual de escritorio por controlador pasó y revisión móvil/flujo real queda asentada en el informe de etapa. F2 depende de E2–E4 y no de la tienda ni de la analítica; E5 y E6 siguen antes de F3. Detalle en [plan frontend](frontend.md) e [informe Task 9](../../.superpowers/sdd/00-roadmap/task-9-report.md).

## Task 10: F3 - Tienda y espacios de la red

Completar tienda ARS o créditos y pedidos propios sobre servicios transaccionales, panel Prestador de propuestas/ofertas propias, panel Colaborador de recomendaciones/QR/métricas y acceso administrativo al backoffice existente. El servidor sigue siendo autoridad de permisos, stock, pagos y créditos. Verificar límites por rol, reintentos/errores y flujo real de canje demo; declarar sandbox externo pendiente si faltan credenciales. PR propio después de F2. Detalle en plan frontend.

## Orden de integración y Git

E1 -> E2 -> E3 -> E4 -> F2 -> E5 -> E6 -> F3. F1 comparte base y contratos; se entrega aparte sin depender de elección para avanzar backend. Un primer commit documental en main; cada etapa posterior tiene rama y PR. Los PRs se apilan contra la rama previa para mantener diffs acotados. Pruebas y revisión antes de publicar cada PR.

Antes de E4, integrar la rama separada de F1 y migrar herramientas en un cambio propio a uv 0.11.3 para backend y pnpm 11.22.0 para frontend, según la preferencia confirmada. F2 usa la elección Beneficios + Pasaporte inmediatamente después de E4 revisado; E5 y E6 siguen, y F3 viene después de F2 y E6. Esto no cambia los cuatro roles persistidos.

## Cierre de etapa

Requisitos implementados y comprobados, registro de pruebas, revisión independiente, contexto/ToDo actualizados y PR adjunto al chat. Cualquier limitación externa queda declarada en el PR. Docker real es requisito para declarar pruebas PostgreSQL completas.
