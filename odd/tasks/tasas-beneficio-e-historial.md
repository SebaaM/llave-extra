# Tasas por beneficio e historial del Colaborador
Rama `feature/perfiles-comisiones`. Entrega en el PR hacia `develop`, con commits por funcionalidad. Pruebas: pytest en PostgreSQL y Vitest.

## Specs

- S1. «mismo porcentaje, se ajusta por beneficio». La selección vale para todos los colaboradores del beneficio.
- S2. «me gusta la configuracion global del 5%. estoy pensando, que el prestador tambien pueda cambiar el porcentaje de comision, dar opciones fijas como 3% o 7% o 10%.» El Administrador configura la tasa global; el Prestador elige global, 3 %, 7 % o 10 % en beneficios de su negocio. Auditar el cambio y proteger escrituras con versión e idempotencia.
- S3. «si» a fijar la tasa en la validación QR y PIN. Guardar tasa y origen en la misma transacción. Aprobaciones anteriores y casos legados conservan sus reglas; reintentos y anulaciones conservan las invariantes de E4.
- S4. «como Colaborador: necesito agregar las comisiones pendiente y los consumos que se han realizado con sus recomendaciones.» Historial propio paginado y total de aprobadas pendientes, con DTO de lectura sin datos del Cliente ni bancarios.
- S5. «si hace los commits segun funcionalidadad agregada. y el pr hacia develop».

## Tasks

- T1 · S1–S3 · inline · opción de Prestador, captura transaccional y aprobación · 74f21ed.
- T2 · S4 · delegado · API privada, historial y total del Colaborador · pruebas focales aprobadas.
- T3 · S5 · inline · verificación, commits y PR · pendiente.

## Log

- L1. «si hace los commits segun funcionalidadad agregada. y el pr hacia develop».
- Base `13bab68`. El contrato de unión será `Commission.verified_rate`, decimal nullable para legados. El total se calcula sobre todos los casos propios `TO_PAY` con aprobación positiva. Un pago informado continúa pendiente hasta la conciliación.
- Espejo Engram pendiente porque la herramienta no está disponible.

- PostgreSQL: 15 pruebas de créditos y comisiones, 2 de historial y 3 de verificación del corte final. Frontend: 401 pruebas más proxy, lint, tipos y build. Ruff, migraciones y OpenAPI estricto aprobados. Revisión independiente de migración, permisos y bloqueos sin hallazgos bloqueantes.
