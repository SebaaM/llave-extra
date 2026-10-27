# Verificación del panel administrativo React

Estado al 26/10/2026: `/gestion` y la configuración están implementados. Corte de producto `affa345`, con comprobaciones y revisión independiente aprobadas; publicación del PR/CI pendiente. E6, compra del Cliente, sandbox externo y despliegue productivo quedan fuera de esta etapa.

## Corte y entorno

Rama `feature/panel-admin` basada en `a584e99`, dependiente de PR #11 y #10 (ambos abiertos al inicio). QA se hizo en el proyecto Docker aislado `llaveextra-admin`, con PostgreSQL/Redis y datos sintéticos; no se usó SQLite ni se cargaron semillas en la base principal.

| Comprobación | Resultado |
| --- | --- |
| Backend en `affa345` | **274 aprobadas en 345.41 s** sobre PostgreSQL/Redis. Ocho regresiones focales; Ruff, migraciones sin drift y OpenAPI sin advertencias. |
| Frontend en `affa345` | **115 UI y 1 proxy**, lint, tipos y build correctos. Un timeout histórico al competir con build motivó repetir la suite completa sin esa carga: 115/115 en 48.75 s; no se cambió producto para ocultarlo. |
| API HTTP real aislada | Tras recargar el servidor corregido: trece recursos/listados y detalles, dashboard, DTO público, cuatro roles, conflicto 409, delta/replay y restitución, QR dedicado: pasó. Sin imprimir credenciales. |
| Componentes con API HTTP real | Corte previo `2c4f40c`: **5/5** (configuración, edición, stock, menú y decimales), con datos restituidos. En el código corregido: QR PNG Prestador/Colaborador **2/2**, firma PNG y liberación de blobs. No equivale a QA nativa del navegador. |
| QA navegador, 26/10 | Guardado/restauración de título y efecto en portada, menú por teclado y filtro real de stock en viewport 320 px; ancho medido 305 px. No cubrió archivos, QR ni confirmaciones financieras nativas. |
| Migraciones principales, 25/10 | Respaldo custom creado; `pg_restore --list` leyó el índice, pero no se probó restauración. `migrate --noinput` aplicó `administration.0001` y `.0002`. Conteos antes/después: 17 usuarios, 14 prestadores, 14 beneficios, 10 relaciones históricas, 8 selecciones, 6 consumos, 7 movimientos, 0 productos y 0 pedidos. Sin semillas ni cambios de cuentas/credenciales. |

Comandos reproducibles: backend `docker compose -p llaveextra-admin run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q`; frontend `docker compose -p llaveextra-admin run --rm --no-deps frontend pnpm test --maxWorkers=1`. Bajo los mismos servicios se ejecutaron `ruff check .`, `python manage.py makemigrations --check --dry-run`, `python manage.py spectacular --validate --fail-on-warn` y `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`. Los arneses y credenciales temporales no se versionan.

## Seguridad y decisiones revisadas

Los endpoints, acciones y medios exigen cuenta activa, rol `ADMIN`, `is_staff` e `is_superuser`. QA rechazó roles no autorizados; los contratos públicos se limitan a presentación. Replays, conflictos y carreras PostgreSQL fueron cubiertos en las suites y revisión independiente focal; no constituyen certificación de seguridad de todo el producto.

El digest de versiones de Prestador y Colaborador incluye relaciones y credenciales relevantes. Evita acciones desde fichas obsoletas y cambios silenciosos; el coste aceptado es un 409 conservador que puede exigir recargar la ficha tras cambios relacionados.

El resumen del DTO de lista de pedidos evita precargar historia anidada; se difirió la paginación independiente de historias y selecciones. Fichas con mucha historia o carpetas grandes todavía pueden ser costosas: carga, latencia y memoria a esos volúmenes no se midieron.

## Pendientes y límites

La revisión integral encontró 0 críticos, 3 importantes y 10 menores. La única ola final produjo `affa345`: QR PNG, errores por campo y controles bloqueados mientras guarda, además de navegación, accesibilidad, recarga, cancelaciones e identidad de actividad. La revisión focal independiente aprobó los tres importantes y nueve menores; el restante es la deuda de escala mitigada descrita arriba. No identificó nuevas roturas atribuibles al cambio. No equivale a una auditoría integral de seguridad.

Pendiente de entrega: PR/CI. Límite de QA: archivos/QR/confirmaciones operativas no acreditados en navegador nativo; la herramienta detuvo el último intento por no poder verificar la URL. El usuario pidió cerrar sin ampliar funcionalidades ni seguir intentando ese QA visual.

Antes de publicar se revisaron los 17 Markdown nuevos/modificados, se simplificaron plan y evidencia y no se encontraron valores concretos sensibles. `.gitignore` excluye `*.diff`; no hay archivos de ese tipo versionados. Esta revisión documental no certifica la seguridad integral del repositorio.

Mercado Pago no se validó en sandbox externo. Las pruebas HTTP/UI usan entorno aislado y adaptadores de prueba; no demuestran pagos reales, scheduler ni despliegue.
