# Revisión independiente del plan de auditoría

Fecha: 24/10/2026 (Argentina). Alcance: documentación del plan, diseño, checklist, registro y prompt; contraste con `AGENTS.md`, estado vigente de `CONTEXT.md` y archivos de configuración referenciados. No se ejecutó auditoría del producto, pruebas de seguridad ni servicios Docker. No se leyeron archivos de credenciales.

**Veredicto:** el diseño cubre el pedido y no presenta bloqueantes de arquitectura o alcance. La documentación distingue correctamente planificación y ejecución, funcionalidades presentes y pendientes, evidencia histórica y nueva, laboratorio y entornos existentes, simulación y sandbox externo. El circuito de hallazgo → corrector → revisor independiente → cierre por el orquestador es consistente con las reglas del proyecto.

## Ajustes recomendados antes de ejecutar

1. **P2 — Hacer explícitos los settings del comando de tests.** Task 2 exige QA HTTP con settings locales y tests con `config.settings.test`, pero el ejemplo ejecuta `exec -T backend pytest -q` sin imponer settings. El Compose habitual establece `DJANGO_SETTINGS_MODULE=config.settings.local`; ese entorno puede prevalecer sobre el valor de `backend/pyproject.toml`. Aunque el Compose de auditoría aún no existe y debe ser independiente, dejar la selección implícita hace ambiguo el comando reproducible. Sugerencia: usar `exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q` o `pytest --ds=config.settings.test -q`, y registrar el módulo efectivo y destino PostgreSQL/Redis sin secretos. Mantener el servidor HTTP en settings locales. Esto evita confundir un error de entorno con una falla de dominio o validar inadvertidamente con configuraciones diferentes.

2. **P3 — Conservar una receta saneada del laboratorio.** Compose y variables se generarán bajo `work/security/` ignorado. Es apropiado para claves efímeras, pero el resumen debería exigir una plantilla sin secretos o un generador versionado que permita reconstruir puertos, redes, volúmenes, healthchecks y restricciones de egreso. Actualmente se exigen comandos y versiones, pero no un artefacto durable equivalente a la configuración ignorada. Sugerencia: añadir esa salida a Task 2; no versionar `audit.env` ni copiar configuración expandida con secretos. No es necesario implementarla durante esta entrega documental.

## Comprobaciones de coherencia

- La selección concreta `FolderBenefit`, ausencia de autorización histórica, revocación QR y consumo directo/referido estricto están reflejados en el diseño y los controles R/C.
- Se preservan roles, flags administrativos, permisos por objeto, sesión Django separada y autenticación HMAC del webhook.
- El plan incluye carreras PostgreSQL, locks, idempotencia, snapshots, reserva impaga, pago tardío y reintegro posterior a retiro.
- Cada control se expande por endpoint/método/actor/objeto; no hay PASS por test histórico, tarea pendiente, mock o bloqueo externo. Los hallazgos conservan identidad y trazabilidad tras la corrección.
- Se exige revisión final de cobertura e invalidación de casos afectados por cambios; los riesgos aceptados requieren decisión del usuario y no equivalen a PASS.
- Los scripts frontend y las rutas principales de pruebas citadas existen. El uso de Compose independiente evita ejecutar los ejemplos contra el proyecto habitual.

No se evaluó si el producto satisface los controles: esa conclusión corresponde exclusivamente a la futura campaña con evidencia del corte elegido.

## Revisión focal posterior

Fecha: 24/10/2026 (Argentina). Se releyeron exclusivamente los ajustes de la spec, Task 2 del plan y el prompt. **P2 resuelto documentalmente:** el comando impone `DJANGO_SETTINGS_MODULE=config.settings.test`, exige el mismo override en pruebas focales y mantiene separados los settings del servidor QA. **P3 resuelto documentalmente:** los tres documentos exigen `docs/security/laboratorio.md` versionado, saneado, sin valores secretos; Task 2 exige probar la reconstrucción antes de acreditar reproducibilidad.

**Veredicto final documental: aprobado, sin observaciones pendientes de esta revisión.** La preparación del laboratorio y su verificación permanecen correctamente como trabajo futuro. No se ejecutó la auditoría ni se acreditó que el producto supere los controles.

## Comprobación previa al commit — 26/10/2026

Validación PowerShell sobre los seis documentos de esta entrega: exit 0; enlaces locales existentes, sin espacios finales, 85 controles con IDs únicos y estados iniciales `NO`/`NO_EVALUADO`. Búsqueda acotada de patrones de claves privadas, tokens GitHub y JWT completos: sin coincidencias; no equivale a una auditoría exhaustiva de secretos del repositorio.

`git apply --cached --check work/security/auditoria-context.patch`: exit 0; el parche selecciona únicamente el párrafo propio de auditoría en `CONTEXT.md`, excluyendo el resumen de traspaso ajeno. ToDo y roadmap solo agregan el enlace/estado de esta campaña. Cambios de frontend, backend y documentos del panel administrativo quedan fuera del commit.

La verificación corresponde exclusivamente a documentación. No se ejecutaron pruebas de dominio, servicios Docker ni auditoría activa para este commit; no hay cambios de producto que validar en esta entrega.
