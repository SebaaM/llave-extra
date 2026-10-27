# ADR 0001: Monorepo y entorno local

- Estado: aceptado para E1.
- Fecha: 2026-10-17.

## Contexto

Backend, frontend, contratos API y entorno deben evolucionar por etapas coordinadas. Las carpetas y sus referencias son privadas y requieren autorización central del servidor; una arquitectura con varios servicios en E1 aumentaría los límites de confianza y el costo operativo antes de existir comportamiento de dominio.

## Decisión

Mantener un monorepo con Django 5.2/DRF, PostgreSQL 17, React/TypeScript/Tailwind/Vite y Docker Compose local. Versionar API bajo `/api/v1/` y documentarla con OpenAPI. Mantener separados los módulos Django por dominio cuando se implemente cada etapa, y conservar al backend como autoridad de acceso y transacciones.

Las dependencias y las imágenes de infraestructura se fijan a versiones concretas para que cada entrega pueda repetirse. La Task 8 fija uv 0.11.3 y pnpm 11.22.0 con `uv.lock` y `pnpm-lock.yaml`; E1 usa Django 5.2.18 con Python 3.13, PostgreSQL 17.11 y Mailpit 1.31.6; PostgreSQL 17.11 es el parche estable publicado al 17-10-2026, y Django 5.2 soporta Python 3.13 ([compatibilidad Django](https://docs.djangoproject.com/en/5.2/faq/install/), [release PostgreSQL 17.11](https://www.postgresql.org/docs/release/17.11/), [release Mailpit 1.31.6](https://github.com/axllent/mailpit/releases/tag/v1.31.6)). Revisar parches de seguridad antes de cada etapa y actualizar versiones junto con su build y pruebas. La actualización de imágenes conservando datos locales requiere compatibilidad de versiones; no se borra el volumen automáticamente.

## Alternativas consideradas

- Separar frontend y backend en repositorios y despliegues independientes: favorece ciclos separados, pero duplica coordinación y configuración antes de que las interfaces sean estables.
- Agregar un framework full-stack que mezcle UI/API: simplifica el despliegue inicial, pero no encaja con Django/DRF ya aprobado ni deja tan claro el límite de autorización del servidor.

## Consecuencias

Una sola revisión puede cubrir cambios de contrato y consumidor; Compose da un entorno local reproducible y el desarrollo no exige Python ni Node en el host. E2-E5 completarán progresivamente `docs/api.md`, `docs/data-model.md` y `docs/business-rules.md` con contratos y reglas concretos; E1 no anticipa documentación de dominio inexistente.
