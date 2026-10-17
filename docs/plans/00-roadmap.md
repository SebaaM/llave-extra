# Plan de implementación aprobado

Objetivo: reconstruir Llave Extra en etapas verificables, con PRs independientes y roles corregidos. La aplicación no publica las carpetas de colaboradores ni sus prestadores sin acceso a través de un QR autorizado.

## Restricciones globales

Stack Django/DRF, PostgreSQL, React/TypeScript/Tailwind, Docker; Conventional Commits con texto en español. `.env-example` vacío, secretos locales ignorados. Datos de prueba identificados; documentación breve de arranque y cuentas. Sin merges automáticos. El PIN fijo tiene riesgo residual de compartirse; no equivale a prueba física de consumo.

## Task 1: E1 - Base del proyecto

Crear backend y frontend mínimos, Docker Compose, PostgreSQL, Mailpit, modelo por email inicial, configuración validada, salud, scripts multiplataforma, datos demo iniciales y CI. Verificar migraciones, PostgreSQL real, lint, tipos y build. Instrucciones cortas y contraseñas locales generadas. API aún sin dominio. Archivo: `01-base-proyecto.md`.

## Task 2: E2 - Autenticación y acceso privado

Registro/login/verificación/reset/JWT, sesiones revocables y límites de intentos. Definir roles ADMIN, PROVIDER, COLLABORATOR, TOURIST. Referencias de QR firmado por colaborador, versión y habilitación; carpeta y acceso turístico persistido solo al redimir QR válido autenticado. No devolver datos de carpeta a anónimos. Archivo: `02-autenticacion-api.md`.

## Task 3: E3 - Prestadores y carpetas

Prestadores, beneficios, pertenencia de usuario prestador y carpetas curadas por administrador. API filtra cada listado y detalle por acceso activo a la carpeta, pertenencia y estado. Prestador edita solo sus datos; colaborador solo consulta su carpeta y referencias. Cargar inventario de comercios como demo sin confundir ejemplos. Archivo: `03-comercios-colaboradores.md`.

## Task 4: E4 - Consumos y créditos

QR del prestador + PIN fijo hash, email verificado y referencia de carpeta activa. Una acreditación de por vida por turista/prestador, idempotencia, transacciones, regla global/per-prestador y snapshot, libro de movimientos, saldo, progreso y ajustes pendientes con bloqueo de canjes. Archivo: `04-consumos-creditos.md`.

## Task 5: E5 - Tienda

Productos demo, stock, pedidos por dinero o créditos, canjes atómicos, reserva monetaria 15 minutos, retiro y cancelación revisada por administrador. Adaptador Mercado Pago Orders API y firma de webhook, idempotencia, tareas recuperables. Pruebas con adaptador simulado claramente identificadas y procedimiento sandbox; no afirmar validación real sin credenciales. Archivo: `05-tienda-pagos.md`.

## Task 6: E6 - Analítica y preparación operativa

Métricas por rol, referencias atribuidas, consumo/crédito/venta derivados del servidor, controles de seguridad, backups/restauración, tareas de reconciliación y documentación. Sin despliegue productivo ni cambio del sitio actual. Archivo: `06-analitica-salida.md`.

## Task 7: F1 - Prototipos de frontend

Tres opciones React/Tailwind navegables (guía/pasaporte/beneficios), misma identidad y datos mock, landing pública y carpeta privada tras simulación de acceso por QR. Registro/login/ficha/progreso. No conectar una opción como frontend definitivo hasta que el usuario elija. Archivo: `frontend.md`.

## Dependencias y Git

E1 -> E2 -> E3 -> E4 -> E5 -> E6. F1 comparte base y contratos; se entrega aparte sin depender de elección para avanzar backend. Un primer commit documental en main; cada etapa posterior tiene rama y PR. Los PRs se apilan contra la rama previa para mantener diffs acotados. Pruebas y revisión antes de publicar cada PR.

## Cierre de etapa

Requisitos implementados y comprobados, registro de pruebas, revisión independiente, contexto/ToDo actualizados y PR adjunto al chat. Cualquier limitación externa queda declarada en el PR. Docker real es requisito para declarar pruebas PostgreSQL completas.
