# Corrida de auditoría del 05/11/2026

**Estado** INCOMPLETA, en ejecución.

Corte inicial `74678381e703fc8862f04a4d7b2379faa2a05576` de `origin/develop`. Rama `feature/auditoria-seguridad`, worktree limpio al crearlo. Incluye el catálogo y el backoffice de tienda del PR #20. Los cambios locales posteriores de otra rama quedan fuera de este corte.

Laboratorio `llaveextra-security` con puertos de loopback, credenciales sintéticas y pagos deshabilitados en QA HTTP. Se aplica la [receta del laboratorio](../../laboratorio.md). Las pruebas de dominio usan PostgreSQL y Redis. El contrato del simulador no acredita interoperabilidad con Mercado Pago.

Compose v5.5.1 construyó backend y frontend con los locks del corte. La migración de una base PostgreSQL vacía del proyecto terminó sin errores. El inventario del resolver registró 318 patrones y comparó las operaciones publicadas en OpenAPI. Salud respondió HTTP 200 por backend directo y por Nginx. [Inventario](../../inventario.md) · [Casos](casos.md).

## Responsables y alcance

- Orquestación, superficie, infraestructura y evidencia canónica en este worktree.
- Identidad y sesiones, privacidad y permisos, y negocio transaccional se revisan por carriles independientes con auditores `gpt-6.1-sol` (high).
- Los commits de corrección se separan por causa reproducida y requieren revisión independiente. Los casos que falten permanecen pendientes en el [checklist](../../checklist.md).
