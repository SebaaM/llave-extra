# Verificación — E6.4 T7: respaldo y restauración

Estado: **verificado con límites**. Una copia congelada se restauró y el dominio/medios concilian; el test de aplicación del destino pasó con Django `Client(secure=True)`, no con TLS/Nginx real. El simulacro no valida disponibilidad productiva.

## Alcance

- Simulacro local con datos sintéticos en proyectos nuevos `llaveextra-e6-src` y `llaveextra-e6-restore`.
- Respaldo consistente de PostgreSQL y medios públicos/privados con escritores de aplicación detenidos.
- Controles negativos de identidad de destino y manifiesto antes de restaurar.
- Rechazo de access/refresh anteriores tras restaurar una sesión anterior a su revocación y rotar solo la clave JWT sintética.
- Conciliación de conteos, saldos/libro, pedidos, comisiones y medios.

## Checklist previo a ejecutar

Referencia operativa: [runbook T7](../operations/e6-backup-restore.md).

- [x] Se escribió el checklist de aislamiento, identidad y controles negativos antes de ejecutar el laboratorio.
- [x] El orquestador confirmó el commit base T6 `351d7bf`; `compose.e6.lab.yaml` permanece sin cambios.
- [x] Los dos proyectos y sus recursos estaban ausentes en el preflight read-only.
- [x] `docker compose ... config --quiet` validó redes internas para PostgreSQL/Redis/backend, `pull_policy: never` y publicación exclusivamente loopback para Nginx; no se configuran llamadas externas.
- [x] Los scratch por proyecto se pasan solo a contenedores de una ejecución y no al backend persistente.
- [x] Las bases confirman nombres y PostgreSQL 17.11; el destino quedó vacío antes de restaurar.
- [x] El manifiesto enlazó PostgreSQL y ambos archivos de medios fuera de Git.
- [x] El destino sintético incorrecto se rechazó antes de crear recursos.
- [x] El manifiesto con checksum incorrecto se rechazó antes de restaurar; SQL y volúmenes de destino quedaron idénticos.
- [x] Restauración, `migrate --check` y comparación de dominio/medios terminaron sin diferencias.
- [x] Access antiguo observó 401, refresh antiguo no vencido observó 401, login nuevo y lecturas permitidas/denegadas comprobadas. El access ya estaba vencido al probar HTTP; la comprobación causal de firma se documenta abajo.

La fixture usa `seed_activity_demo` en su mínimo de 20 Clientes, un PNG sintético unido a una oferta publicada y seleccionada, y un marcador inerte en `MEDIA_ROOT` para comprobar el volumen público. En esta versión los endpoints de catálogo y carpeta devuelven medios guardados físicamente en `private_media_data`; no se inferirá una publicación estática desde el marcador de volumen.

## Evidencia

No registrar contraseñas, llaves, cookies, tokens, correos ni bytes de medios. El manifiesto completo, credenciales y copias están en `lab-restore/`, ignorado por Git.

| Control | Comando/evidencia | Resultado |
|---|---|---|
| Preflight y límite de red | `docker compose ... config --quiet`; `docker compose ... up -d --pull never redis backend nginx` en destino | Preflight/imagenes locales pasaron y Compose T7 quedó sin diff. `llaveextra-e6-src` usó Nginx loopback real: `curl.exe --cacert <CA> --ssl-no-revoke https://localhost:8443/api/v1/auth/csrf/` → 200. Al abrir el Nginx restaurado, Docker rechazó crear `llaveextra-e6-restore_edge`: `all predefined address pools have been fully subnetted`. No se borró ni reutilizó red; no se abrió puerto destino. |
| Identidad y vacío | `docker inspect` labels + `psql current_database/current_user/server_version/public-table-count` | Origen `llaveextra-e6-src|db`, SQL `e6_src_db|e6_src|17.11|0` antes de migrar. Destino `llaveextra-e6-restore|db`, `e6_restore_db|e6_restore|17.11|0` antes de restaurar. Medios destino antes de prueba negativa: `0 archivos/0 bytes` en cada volumen. |
| Fixture y línea base congelada | `seed_activity_demo --customers 20`; dos `snapshot_facts.py` consecutivos, backend/Nginx detenidos | Checkpoints `catalog=1|store=1|customers=20|payments=20`; 20 Clientes sintéticos. Snapshots idénticos, PostgreSQL 17.11, fingerprint `a3c382b052e12752541217cf834389a72b9ba6f19a575f6b3a48aa362ce21e15`, ledger conciliado. Conteos: 17 wallets, 78 entradas de libro, 63 consumos, 15 pedidos, 15 líneas, 44 auditorías, 21 accesos a carpeta, 60 beneficios, 30 prestadores, 12 productos; comisiones/eventos de comisión fueron 0 en esta semilla. Cada volumen contenía 1 archivo (público 47 B, privado 79 B). |
| Copia y manifiesto | `pg_dump -Fc`; archivos fuera de Git; SHA-256/tamaño en manifiesto | PostgreSQL dump 251091 B, SHA256 `4474bf4f61c4c949832e8b78617f21cb1532d45b9de315812727ed8ae6d40ee9`; tar público 171 B, `cae949a9ef74b9e39b75544c8b78f683ab612c44f5fd20b74b9d7c29395f358a`; tar privado 265 B, `c4a0806bebf3408ecca7f63490892a7c04a6ab20c98765973a39ad8696391d63`. Manifiesto enlaza proyectos, DBs, imagen/versión 17.11, volúmenes y los tres hashes. Duración de respaldo/restauración end-to-end no fue cronometrada; no afirmar un RTO. |
| Destino sintético incorrecto | Preflight de proyecto `llaveextra-e6-not-restore` | Exit 20 `T7_REJECT=TARGET_PROJECT_IDENTITY`; inventario exacto posterior: 0 contenedores, 0 redes, 0 volúmenes con esa etiqueta. |
| Manifiesto con checksum incorrecto | Inventario SQL/medios antes y después; checksum manipulado en copia ignorada | Exit 29 `T7_REJECT=ARTIFACT_SHA256`. Antes y después idénticos: `llaveextra-e6-restore|db;e6_restore_db|e6_restore|17.11|0;0,0|0,0`. No se ejecutó `pg_restore` ni extracción durante este control. |
| Restauración y comparación | `pg_restore --no-owner --no-acl --exit-on-error` (sin `--clean`/`--create`); extracción de tar; `migrate --check`; `snapshot_facts.py` | Restauración exit 0; 1 archivo/47 B al volumen público y 1/79 B al privado. `migrate --check` exit 0. Fingerprint pre-backup y destino restaurado idénticos (`a3c382...`); PostgreSQL 17.11; saldos/libro, conteos, pedidos/auditorías, estado e historial, y hashes de medios coincidieron. La fila AuthSession quedó activa (1 activa/0 revocadas) pese a que la fuente quedó revocada después (0 activas/1 revocada). |
| Tokens y medios restaurados | Test client Django/DRF bajo `config.settings.prod`, `secure=True`, Host `localhost:8443`; prueba offline de firma HS256 | Access antiguo HTTP 401, pero su `exp` había vencido 544 s antes: no atribuir ese 401 únicamente a la rotación. Prueba offline con firma verificada: original valida con clave anterior y produce `InvalidSignatureError` con clave destino; solo `verify_exp=False`, firma habilitada. Refresh firmado y no vencido: HTTP 401 con fila restaurada activa. Login nuevo/`me` 200; catálogo público 200 + hash correcto; carpeta autenticada 200 + hash correcto; carpeta anónima 401. Estos son requests del test client con esquema seguro simulado, no TLS real. |

Revisión independiente: se verificaron la identidad del destino, la secuencia de validación previa a la restauración y el uso no interactivo de las credenciales PostgreSQL. El orquestador también confirmó en ambos PostgreSQL 17.11 los agregados de 17 billeteras, 78 movimientos, 63 consumos y 15 pedidos, con cero diferencias saldo/libro. Pasaron el análisis sintáctico de PowerShell y el análisis AST de los dos ayudantes Python en un contenedor sin red. No se repitió la restauración para validar estas correcciones del runbook.

## Límites y pendientes operativos

RPO/RTO, ubicación y retención del respaldo, custodia de llaves, TLS/Nginx restaurado, SMTP público, scheduler real, sandbox de pagos y restauración productiva requieren definición y evidencia del operador. El destino se probó solo mediante test client interno porque Docker no pudo asignar otro pool de red; no limpiar/reutilizar redes existentes sin autorización. La primera ejecución del helper de auth creó una sesión sintética y falló al leer `FileResponse.content`; se corrigió a `streaming_content` y la repetición pasó, creando una segunda sesión de prueba. No se eliminó estado ni se repitió backup/restauración.

## E6.4 T8 — Scheduler de laboratorio

| Comprobación | Resultado |
|---|---|
| PostgreSQL/Redis y proveedor simulado: `pytest -q shop/tests/test_scheduler_lab.py` | 5 aprobadas. Las pruebas verifican rechazo antes de iniciar workers, límites del laboratorio, diagnósticos sin escrituras y un reintegro/reposición de stock únicos al repetir el ciclo tras una interrupción. |
| Revisión de la guarda de ejecución | Se reprodujo que la configuración de pruebas permitía una identidad de base arbitraria. Ahora la lista de hosts y bases permitidos se exige siempre; solo el fixture adapta los valores para su PostgreSQL desechable. Reexamen independiente aprobado. |
| Compose de laboratorio: `docker compose run --rm --no-deps --pull never scheduler python manage.py run_shop_scheduler_lab --once --limit 1` | Un ciclo real sobre la copia sintética ya verificada: código 0, outbox 1, reservas vencidas 0, conciliación 1, backlog 2, bloqueadas 0, diferencias saldo/libro 0. No se abrió ningún puerto ni se llamó a un proveedor externo. El ciclo se ejecutó antes de endurecer la guarda; la identidad usada continúa autorizada. |
| Ruff focal y Compose `config --quiet` | Aprobados. Las suites completas previas al scheduler fueron 583 backend y 459 frontend; se eligió verificación focal para el corte final. |

El ciclo de recuperación comprobó el comportamiento simulado, no un scheduler productivo, ni un pago real. El [checklist de traspaso](../operations/e6-handoff.md) separa ambos alcances.
