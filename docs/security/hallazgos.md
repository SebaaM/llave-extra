# Registro de hallazgos de seguridad

Estado inicial, 24/10/2026: **auditoría no iniciada; cero hallazgos registrados por esta campaña**. Esto no significa que haya cero vulnerabilidades. No reutilizar problemas históricos como hallazgos nuevos sin reproducirlos en el corte auditado.

Referencias: [plan](../superpowers/plans/2026-10-24-auditoria-seguridad.md), [checklist](checklist.md), [prompt](prompt-auditor.md).

## Índice

| ID | Feature / controles | Severidad | Estado | Problema / impacto | Solución | Revisión / evidencia |
|---|---|---|---|---|---|---|

La tabla empieza vacía deliberadamente. Agregar una fila por hallazgo real; IDs `SEC-001` en adelante, permanentes. Varias observaciones con la misma causa pueden compartir hallazgo si la reproducción cubre todos los endpoints afectados.

## Estados y prioridad

`POR_REPRODUCIR` → `CONFIRMADO` → `ASIGNADO` → `EN_CORRECCION` → `CORREGIDO_PENDIENTE_REVISION` → `CERRADO`.

También: `REABIERTO`, `BLOQUEADO` (con causa y siguiente paso), `FALSO_POSITIVO` (con evidencia) y `RIESGO_ACEPTADO` (solo decisión explícita del usuario con motivo/fecha/revisión). Un riesgo aceptado no se convierte en PASS ni desaparece de los pendientes de riesgo.

Severidad propuesta según impacto y precondiciones reales: **crítica** para control administrativo o fraude/compromiso amplio sin autorización; **alta** para acceso privado cruzado, toma de cuenta o alteración de créditos/pagos/stock; **media** para exposición/abuso limitado con precondiciones; **baja** para endurecimiento con impacto reducido. Explicar el razonamiento por caso; no asignar CVSS exacto sin calcularlo ni confundir probabilidad con impacto. Reproducir y priorizar críticas/altas primero; no detener las otras comprobaciones independientes.

## Ficha obligatoria por hallazgo

Copiar esta estructura al registrar cada problema, reemplazando todos los marcadores; no presentar la plantilla como hallazgo.

```markdown
### SEC-NNN — título concreto

- Estado, severidad y justificación de impacto/precondiciones:
- Fecha/zona, run-id, SHA y hash del diff local si corresponde:
- Feature/task, control_id y case_id afectados:
- Regla vigente y fuente (spec/contrato/requisito OWASP versionado):
- Actor atacante, actor legítimo, ownership y datos sintéticos requeridos:
- Superficie: método + ruta/servicio/comando + campos implicados:
- Pasos reproducibles mínimos y request saneado:
- Esperado / observado, con status y aserciones de BD/archivos/sesión:
- Alcance: endpoints hermanos, medios y operaciones afectadas:
- Evidencia de reproducción y prueba RED (comando, exit, assertions):
- Causa raíz, archivos y líneas del corte:
- Corrector asignado, archivos permitidos, dependencias y restricciones:
- Solución aplicada y commit/diff; migración/contrato si corresponde:
- Prueba GREEN y checks (comando, fecha, exit, conteo real):
- Revisor independiente, reproducción original/variantes y resultado:
- Verificación final del orquestador y corte final:
- Riesgo residual, bloqueo/decisión del usuario si existe:
- Historial de estados (fecha, actor, motivo):
```

## Regla de cierre

El corrector no cierra su hallazgo. El orquestador exige evidencia nueva del ataque original, regresión permanente pertinente, revisión independiente aprobada y checks sobre el corte integrado. Registrar intentos rechazados y reaperturas; no borrar evidencia histórica al corregir.

No adjuntar capturas/HAR/dumps crudos con credenciales o PII. Conservar la forma del ataque y las aserciones usando alias y valores redactados. Un SHA, un status 403 aislado o un informe de scanner no sustituyen la prueba del control.
