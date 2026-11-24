# Seed de actividad demo — Implementation Plan

> **For agentic workers:** ejecutar los pasos en orden y verificar sobre PostgreSQL real.

**Goal:** comando manual con actividad abundante y coherente para recorrer web y backoffice.
**Architecture:** namespace ficticio versionado, bloqueo PostgreSQL y checkpoints; servicios de dominio y FakeGateway limitado a pedidos propios.
**Tech Stack:** Django/DRF, PostgreSQL, Redis y Docker; sin cambios de API/frontend ni migraciones.
**Spec:** `docs/superpowers/specs/2026-11-02-seed-actividad-demo-design.md`.

## Restricciones y foco de revisión

Sin carga automática, secretos versionados, HTTP externo, mutación de datos ajenos, edición de historia financiera o reinicio de stock. Considerar colisión de IDs, archivo perdido, interrupción entre commits, procesos concurrentes, configuración singleton personalizada y cambios manuales posteriores.

### 1. Dataset y comando

- [x] Crear `backend/accounts/demo_activity/` para catálogo, identidades y escenarios; comando `backend/accounts/management/commands/seed_activity_demo.py`.
- [x] Agregar pruebas PostgreSQL en `backend/accounts/tests/test_activity_demo.py` para gates, colisiones, escenarios y repetición.
- [x] Implementar 30 negocios, 10 colaboradores, 12 productos y Clientes configurables; credenciales privadas y checkpoints.
- [x] Implementar consumos directos/referidos y pedidos mediante servicios; fake por pedido fuera de transacciones externas.
- [x] Ejecutar suite focal y corregir fallos; verificar ausencia de HTTP externo y conservación de configuración/datos ajenos.

### 2. Evidencia y entrega

- [x] Probar carga predeterminada completa en PostgreSQL aislado y repetir; verificar saldos contra libro y stock contra pedidos/ajustes.
- [x] Ejecutar backend completo, Ruff, drift/OpenAPI y documentar resultados.
- [x] Actualizar README, DEV, ToDo, contexto e instrucciones; comando manual y guía local de escenarios, sin cambiar contrato API.
- [x] Revisar diff final y preparar entrega sin fusionar PRs ni cargar la base principal.
