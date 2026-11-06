# Corrida de auditoría del 05/11/2026

**Estado** `INCOMPLETA`.

Corte inicial `74678381e703fc8862f04a4d7b2379faa2a05576` de `origin/develop`. Rama `feature/auditoria-seguridad`, worktree limpio al crearlo. Incluye el catálogo y el backoffice de tienda del PR #20. Los cambios locales posteriores de otra rama quedan fuera de este corte.

Laboratorio `llaveextra-security` con puertos de loopback, credenciales sintéticas y pagos deshabilitados en QA HTTP. Se aplica la [receta del laboratorio](../../laboratorio.md). Las pruebas de dominio usan PostgreSQL y Redis. El contrato del simulador no acredita interoperabilidad con Mercado Pago.

Compose v5.5.1 construyó backend y frontend con los locks del corte. La migración de una base PostgreSQL vacía del proyecto terminó sin errores. El inventario del resolver registró 318 patrones y comparó las operaciones publicadas en OpenAPI. Salud respondió HTTP 200 por backend directo y por Nginx. [Inventario](../../inventario.md) · [Casos](casos.md).

## Responsables y alcance

- Orquestación, superficie, infraestructura y evidencia canónica en este worktree.
- Identidad y sesiones, privacidad y permisos, y negocio transaccional se distribuyeron en carriles independientes. Los commits se separaron por hallazgo y los revisores independientes documentaron el alcance de cada revisión.

## Resultado y alcance pendiente

Se registraron 18 hallazgos con un commit de corrección por hallazgo. Cuatro son de severidad alta, siete media y siete baja. La continuación del 06/11 agregó cuatro correcciones y verificó sus regresiones con revisores independientes. [Hallazgos](../../hallazgos.md) · [Casos](casos.md).

De los 85 controles agrupados, dos aprobaron con cobertura completa, 81 tienen evidencia parcial y dos están bloqueados. La continuación agregó evidencia a los cinco que figuraban pendientes. Los hallazgos cerrados no convierten por sí solos el control agrupado en aprobado.

La matriz Django verificó 59 rutas de la API administrativa con 521 comprobaciones de estado HTTP y conteos persistidos. El smoke final por Nginx aprobó 20 comprobaciones de identidad, QR, carpetas, medios privados y permisos de Prestador y Administrador. Las pruebas focales de sesión aprobaron con PostgreSQL y Redis. `uv audit --locked` y `pnpm audit --audit-level moderate` terminaron sin avisos conocidos en los paquetes revisados.

La imagen de backend reconstruida en `71e5e54` aprobó 72 pruebas de reservas, conciliación y pagos simulados en PostgreSQL y Redis. Los casos explicitan su cobertura de webhook, stock y recuperación. [Evidencia de reservas y pagos](casos.md#reservas-y-pagos-simulados).

En la primera pasada, la suite de backend aprobó 452 pruebas en PostgreSQL/Redis sobre `750191d` con el lock final. El cambio posterior `71e5e54` pasó sus regresiones focales y su reejecución independiente. [Regresión integrada](casos.md#regresión-integrada).

En la segunda pasada, Edge confirmó el aislamiento de cuentas entre pestañas, la redención automática de un QR real del laboratorio y el orden de saneamiento en ambas rutas QR del build. La matriz por Nginx aprobó 57 comprobaciones adicionales de identidad y alcance. Aprobaron lint, tipos, build, proxy y 383 pruebas Vitest, incluido el caso de redención que había fallado el 05/11. [Casos del 06/11](casos.md#continuación-del-06112026).

La suite completa de backend sobre el último commit de producto, `859e94d`, aprobó 462 pruebas en PostgreSQL y Redis. Ruff, Django, migraciones y OpenAPI también aprobaron.

Quedan pendientes la matriz completa de roles y objetos por método, las variantes de navegador de los controles parciales y la validación de TLS, HSTS y CSP del despliegue. El sandbox real de Mercado Pago queda para una campaña externa. Django reportó `security.W005` y `security.W021` al revisar el perfil de producción. Extender HSTS a subdominios y habilitar preload requiere validar la política del dominio desplegado. [Checklist](../../checklist.md).
