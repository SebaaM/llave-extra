# Selección contextual y QR estable

Estado: implementación en curso desde `e89329a`, reanudada el 1/11/2026. GitHub informa que PR #16 fue fusionada el 31/10 por fuera de esta ejecución. El corte nuevo se publicará en `feature/cliente-qr-destacados` mediante otra PR hacia `develop`, sin merge. Este documento registra únicamente la verificación nueva; los resultados anteriores no prueban este flujo ni la base combinada con los ajustes recientes de entornos.

## Antes y después solicitado

| Antes | Después |
| --- | --- |
| Sección permanente de recomendaciones y disponibilidad en navegación | Catálogo habitual; selección dinámica al entrar por QR, con el nombre de quien recomienda |
| Lista histórica de accesos para elegir referencia al consumir | Referencia explícita del contexto QR actual; sin colección propia del turista |
| Redención sin nombre de presentación y lectura privada repartida por negocio | Nombre seguro y lista privada paginada de beneficios concretos, con sus negocios |
| Sin resumen acotado en ficha administrativa | Clientes distintos que ingresaron por QR y visitas válidas atribuidas |
| Firma de QR con hora de emisión; botón «Actualizar QR» solo consultaba | Enlace estable por versión; consulta y renovación manual son acciones distintas |
| Hero tomaba la primera página del catálogo habitual | Solo beneficios destacados por el Administrador, publicados/vigentes y con el catálogo habilitado |

El consumo conserva QR del negocio + PIN, reglas de créditos e idempotencia. Una referencia rechazada no se transforma en consumo directo. El vínculo de ingreso conserva autorización/historia, sin copiar beneficios al Cliente.

En un recorrido nuevo, antes del primer envío, se permite elegir explícitamente seguir sin la recomendación activa. Esto evita forzar atribución al usar otro negocio del catálogo. Esa salida no modifica un comando incierto ni se activa automáticamente ante un rechazo.

## Continuidad y privacidad

La selección vigente se consulta en el servidor. La pista por pestaña solo conserva identificadores de cuenta y colaborador, sin nombre, QR, URL, PIN ni credenciales; permite revalidar al recargar desde el QR del negocio. Se limpia al cambiar de cuenta, cerrar sesión, sustituir el QR o revocarse el acceso. Una pestaña nueva sin pista requiere abrir la referencia otra vez; no se reconstruye de accesos históricos.

Los códigos anteriores siguen siendo aceptados hasta su renovación manual. El formato nuevo emite un enlace canónico estable; no hay migración que rote QR ni renovación al editar selección. Los resultados persistidos de renovación no contienen QR, URL ni PIN. El resumen cuenta personas distintas y consumos válidos, no escaneos.

## Cortes comprobados

- API de nombre/selección/resumen: `3d85acf`, 28 pruebas PostgreSQL con `--ds=config.settings.test`, Ruff, OpenAPI sin avisos y drift aprobados. Revisión independiente de código sin hallazgos; árbol del commit idéntico al índice revisado. La corrida ampliada anterior tuvo 163 pases y un fallo por usar settings locales, donde el adaptador fake no estaba permitido; ese caso pasó después con settings de pruebas. No se presenta aquella corrida como suite completa aprobada.
- Destacados backend: `63bccc6`, 68 pruebas PostgreSQL, Ruff, esquema y drift aprobados; revisión independiente sin hallazgos. Incluye upgrade real `0006→0007` en base de pruebas, permisos Admin/Prestador y filtrado antes de paginar. PATCH conserva versión y auditoría existentes; reenvío con versión antigua devuelve 409, sin prometer replay exitoso.
- Migración `providers.0007` aplicada solo a `llaveextra-visual`, después de respaldo local ignorado. Conserva 3 usuarios, 5 negocios, 5 beneficios, 3 selecciones, 1 vínculo y 1 consumo. Ningún beneficio destacado automáticamente. El entorno original sigue intacto.
- QR estable/renovación propia: `e301a7b`, revisión independiente de seguridad/concurrencia sin hallazgos. Cubre ambos formatos, estabilidad, permisos actuales, idempotencia, rollback y concurrencia PostgreSQL real. Migración `referrals.0005` aplicada solo al entorno aislado, sin renovar códigos.
- Corrección de integración `c0d8177`: una prueba histórica retrocedía a providers0006 usando el modelo actual y dejaba el esquema antiguo para las siguientes. Usa modelos históricos y restaura los destinos originales en `finally`; RED reproducido, 24 pruebas focales aprobadas y re-review sin hallazgos. No se cambió producto para acomodar la prueba.
- Suite completa de backend en `c0d8177`: `-m pytest --ds=config.settings.test -q --tb=short` → **383 passed en 152,16 s, exit 0, sin exclusiones**. Cierra la regresión pendiente de A/B y la integración de la nueva migración.

Los comandos backend usan `docker compose --project-name llaveextra-visual --env-file <entorno-local> -f compose.yaml -f work/visual-qa.compose.yaml exec -T backend /opt/venv/bin/python`, seguido de `-m pytest ... --ds=config.settings.test`; para esquema/drift, `manage.py ... --settings=config.settings.test`. Es necesario indicar settings explícitamente porque Compose exporta la configuración local. No se versiona el entorno ni su contenido.

## Evidencia pendiente

- Cliente contextual: pendiente de completar el parcial interrumpido y revisar.
- Espacio QR/resumen Admin: pendiente de implementación y revisión.
- Hero y casilla de destacados en React: pendientes de implementación y revisión.
- Corte final: pruebas PostgreSQL/Redis, frontend, Ruff/OpenAPI/drift y QA real pendientes. No hay afirmación de validación integral todavía.

El entorno Docker aislado `llaveextra-visual` está activo en frontend `5176` y backend `8002`. Las bases y cuentas del entorno original no se modifican por esta entrega. La aprobación del cliente sigue siendo requisito para fusionar.
