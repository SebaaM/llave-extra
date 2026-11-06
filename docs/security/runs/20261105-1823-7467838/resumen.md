# Corrida de auditoría del 05/11/2026

**Estado** `INCOMPLETA`.

Corte inicial `74678381e703fc8862f04a4d7b2379faa2a05576` de `origin/develop`. Rama `feature/auditoria-seguridad`, worktree limpio al crearlo. Incluye el catálogo y el backoffice de tienda del PR #20. Los cambios locales posteriores de otra rama quedan fuera de este corte.

Laboratorio `llaveextra-security` con puertos de loopback, credenciales sintéticas y pagos deshabilitados en QA HTTP. Se aplica la [receta del laboratorio](../../laboratorio.md). Las pruebas de dominio usan PostgreSQL y Redis. El contrato del simulador no acredita interoperabilidad con Mercado Pago.

Compose v5.5.1 construyó backend y frontend con los locks del corte. La migración de una base PostgreSQL vacía del proyecto terminó sin errores. El inventario del resolver registró 318 patrones y comparó las operaciones publicadas en OpenAPI. Salud respondió HTTP 200 por backend directo y por Nginx. [Inventario](../../inventario.md) · [Casos](casos.md).

## Responsables y alcance

- Orquestación, superficie, infraestructura y evidencia canónica en este worktree.
- Identidad y sesiones, privacidad y permisos, y negocio transaccional se distribuyeron en carriles independientes. Los commits se separaron por hallazgo y los revisores independientes documentaron el alcance de cada revisión.

## Resultado y alcance pendiente

Se registraron 14 hallazgos con un commit de corrección por hallazgo. Cuatro son de severidad alta, seis media y cuatro baja. El último commit de producto es `71e5e54`. [Hallazgos](../../hallazgos.md) · [Casos](casos.md).

De los 85 controles agrupados, uno aprobó con cobertura completa, 77 tienen evidencia parcial, cinco quedaron pendientes y dos bloqueados. Los hallazgos cerrados no convierten por sí solos el control agrupado en aprobado.

La matriz Django verificó 59 rutas de la API administrativa con 521 comprobaciones de estado HTTP y conteos persistidos. El smoke final por Nginx aprobó 20 comprobaciones de identidad, QR, carpetas, medios privados y permisos de Prestador y Administrador. Las pruebas focales de sesión aprobaron con PostgreSQL y Redis. `uv audit --locked` y `pnpm audit --audit-level moderate` terminaron sin avisos conocidos en los paquetes revisados.

La imagen de backend reconstruida en `71e5e54` aprobó 72 pruebas de reservas, conciliación y pagos simulados en PostgreSQL y Redis. Los casos explicitan su cobertura de webhook, stock y recuperación. [Evidencia de reservas y pagos](casos.md#reservas-y-pagos-simulados).

La suite de backend aprobó 452 pruebas en PostgreSQL/Redis sobre `750191d` con el lock final. El cambio posterior `71e5e54` pasó sus regresiones focales y su reejecución independiente. En frontend aprobaron lint, tipos y build. La suite obtuvo 374 aprobadas y una falla del flujo QR, reproducida también en la imagen original de `develop`. [Regresión integrada](casos.md#regresión-integrada) · [Frontend](casos.md#frontend).

Quedan pendientes la matriz completa de roles y objetos por endpoint, las comprobaciones en navegador real y la validación de TLS, HSTS y CSP del despliegue. El sandbox real de Mercado Pago queda para una campaña externa. Django reportó `security.W005` y `security.W021` al revisar el perfil de producción. Extender HSTS a subdominios y habilitar preload requiere validar la política del dominio desplegado. [Checklist](../../checklist.md).
