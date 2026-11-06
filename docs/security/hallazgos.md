# Registro de hallazgos de seguridad

Auditoría iniciada sobre `7467838` el 05/11/2026. El estado de cada corrección se refiere al caso reproducido de ese hallazgo. Los casos y resultados se registran por corrida. Los problemas históricos requieren una reproducción en el corte auditado.

Referencias: [plan](../superpowers/plans/2026-10-24-auditoria-seguridad.md), [checklist](checklist.md), [prompt](prompt-auditor.md).

## Índice

| ID | Feature / controles | Severidad | Estado | Problema / impacto | Solución | Revisión / evidencia |
|---|---|---|---|---|---|---|
| SEC-001 | E2/F2, T08/F03 | Alta | CERRADO | Una pestaña adopta una sesión de otra pestaña al reintentar un 401. | `6490060` | Regresión pasó. Revisión estática independiente aprobada. [Casos](runs/20261105-1823-7467838/casos.md#sesión-y-entradas) |
| SEC-002 | Catálogos, A10/F05 | Baja | CERRADO | Filtros públicos con NUL provocan 500 de PostgreSQL. | `78df20a` | Regresión y HTTP pasaron. Revisión estática independiente aprobada. [Casos](runs/20261105-1823-7467838/casos.md#http-público) |
| SEC-003 | E2/F2, T04/T08 | Media | CERRADO | Cierre con access vencido falla con cookie válida. Bearer y cookie de sesiones distintas pueden revocar la equivocada. | `eb97132` | Regresiones pasaron. La revisión detectó el caso independiente SEC-008. [Casos](runs/20261105-1823-7467838/casos.md#sesión-y-entradas) |
| SEC-004 | E2, A07 | Media | CERRADO | El alta sin QR crea cuentas y envía emails sin cuota Redis. | `d4b1531` | 43 pruebas y revisión estática independiente aprobadas. [Casos](runs/20261105-1823-7467838/casos.md#sesión-y-entradas) |
| SEC-005 | E2, A10/F05 | Baja | CERRADO | Cuerpos JSON que no son objetos provocan 500 en endpoints de cuenta. | `4ae6cc9` | Regresión pasó. Revisión estática independiente aprobada. [Casos](runs/20261105-1823-7467838/casos.md#sesión-y-entradas) |
| SEC-006 | E2, A05/A10 | Baja | CERRADO | Reset con contraseña similar al email provoca 500 y revierte el consumo del token. | `d9facd2` | Regresión pasó. Revisión estática independiente aprobada. [Casos](runs/20261105-1823-7467838/casos.md#sesión-y-entradas) |
| SEC-007 | E3/08, P01/P03 | Media | CERRADO | Una escritura del Prestador continúa después de confirmar la baja de su membresía. | `49efef7` | 15 pruebas PostgreSQL y revisión estática independiente aprobadas. [Casos](runs/20261105-1823-7467838/casos.md#autorización-por-objeto) |
| SEC-008 | E2, T03/T04 | Media | CERRADO | Una cookie de refresh rotada puede revocar el SID vigente. | `783da70` | Dos casos RED, ocho GREEN y revisión estática independiente. |
| SEC-009 | E2/Admin, A04/A05/T05 | Alta | CERRADO | Enlaces de verificación o recuperación emitidos antes de un cambio administrativo de email siguen válidos para la cuenta. | `0173874` | Pruebas RED/GREEN con sesión técnica y PostgreSQL. Revisión estática independiente. |
| SEC-010 | E2/Admin, A08/T05 | Media | CERRADO | Una sesión anterior puede volver a autenticar tras desactivar y reactivar la cuenta en Django Admin. | `b1108cb` | Prueba RED/GREEN. La revisión detectó SEC-013 en la emisión concurrente de sesiones. |
| SEC-011 | Dependencias, B06/P07/O05 | Alta | CERRADO | Pillow 11.3.0 figura afectado por avisos de decodificación de imágenes. | `b2e9402` | Sin avisos de Pillow después de actualizar a 13.0.0. Pasaron 16 pruebas de medios y QR. [Versión corregida](https://github.com/python-pillow/Pillow/releases/tag/13.0.0). |
| SEC-012 | Dependencias de desarrollo, B06/O05 | Baja | CERRADO | pytest 8.4.2 figura afectado por manejo inseguro de directorios temporales. | `5342110` | GHSA-6w46-j5rx-g56g/PYSEC-2026-1845 ausente tras actualizar a 9.0.3. Pasaron 44 pruebas focales con el lock final. |
| SEC-013 | E2/Admin, A03/A08/T05 | Media | CERRADO | Un login puede validar credenciales con el estado anterior y emitir la sesión después de la revocación administrativa. | `6077439` | RED 200, GREEN 401 y sin sesión. Revisión estática independiente aprobada. |
| SEC-014 | E2/Admin, A05/T05 | Alta | CERRADO | Una edición de perfil que conserva el hash anterior puede restaurar la contraseña después de un reset exitoso. | `71e5e54` | RED y GREEN en PostgreSQL. Pasaron cinco pruebas de reset y Admin, con dos casos reejecutados por un revisor independiente. |

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
