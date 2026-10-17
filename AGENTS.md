# Instrucciones del proyecto

## Fuente de verdad

Leer `CONTEXT.md` y la etapa correspondiente de `docs/plans/00-roadmap.md` antes de implementar. La corrección más reciente del usuario sobre colaboradores/prestadores prevalece sobre el informe histórico.

## Restricciones

- Django + DRF, PostgreSQL, React + TypeScript + Tailwind; Docker local.
- Usuario por email antes de la primera migración. No usar SQLite para validar código del dominio o pruebas de integración.
- Carpetas y referencias privadas: autorización del servidor por QR válido, colaborador habilitado y prestador perteneciente a esa carpeta. Ocultar enlaces en React no satisface este requisito.
- Prestador y colaborador son roles diferentes. Solo un administrador asigna carpetas, habilita colaboradores y configura las reglas de créditos.
- Consumos, créditos y stock requieren transacciones, restricciones de base de datos e idempotencia.
- No versionar credenciales, `.env`, códigos privados ni cuentas reales. `.env-example` contiene valores vacíos.
- Mantener `ToDo.md`, contexto, instrucciones y contrato OpenAPI alineados con cada funcionalidad.
- Commits Conventional Commits con descripción en español. Trabajar fuera de main después del commit inicial. No fusionar PRs.

## Verificación

Ejecutar comprobaciones relevantes antes de cada commit: pruebas de backend sobre PostgreSQL, lint, tipos y build del frontend según el cambio. Documentar el comando y resultado. No afirmar que una integración externa está validada si solo se probó un adaptador simulado.

## Delegación

Los implementadores no crean otros subagentes ni sus propios revisores. El orquestador asigna trabajo acotado y revisores independientes. Usar modelos económicos para trabajo mecánico y un modelo de juicio adecuado para seguridad y concurrencia. Reportar dudas y hallazgos en archivos, sin duplicar historiales extensos.
