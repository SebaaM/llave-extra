# Task 9 — F2: experiencia principal del Cliente

Fecha de implementación: 18-10-2026. Rama: `codex/frontend-beneficios`, basada en E4. F2 usa E2–E4 y deja la tienda y los espacios de Colaborador/Prestador (F3), Mercado Pago (E5) y analítica (E6) fuera de alcance.

## Requisitos atendidos

- Portada Beneficios y Mi viaje con enfoque Pasaporte. El hero explica el propósito turístico —descubrir beneficios, descuentos y promociones disponibles por referencia— y el recorrido para usarlos. El copy no inventa convenios, descuentos específicos, cifras ni testimonios.
- Registro público únicamente como `TOURIST`; ingreso, cierre local, verificación/reenvío de email, recuperación y restablecimiento de contraseña conectados a E2. La verificación con token one-use usa singleflight y conserva un éxito en memoria para tolerar repetición de efectos React `StrictMode` en desarrollo sin reenviar el token consumido.
- QR de referencia privado leído desde el fragmento, retirado de la barra y retenido en memoria; creación de cuenta o ingreso puede continuar el flujo, y la redención genera/actualiza las carpetas consultadas desde el servidor.
- Beneficios y fichas consultados solo mediante rutas de carpeta autorizadas por E3. El frontend no intenta listar carpetas públicas ni usa datos de F1. Las imágenes privadas llegan como Blob desde el endpoint autorizado, se revocan al terminar y nunca se convierten en URLs bearer.
- QR del Prestador y PIN del Prestador en la solicitud de consumo E4, con `Idempotency-Key`; reintentos del mismo contenido conservan clave y una corrección de campos produce nueva clave. El PIN y QR quedan en memoria/cuerpo HTTPS y no se guardan en URL ni almacenamiento persistente.
- Mi viaje consulta saldo, meta/progreso e historial propios al servidor.
- Logout local invalida tokens y respuestas privadas pendientes. Si el servidor no confirma revocación, un marcador no secreto de pestaña evita restaurar en silencio la cookie refresh al recargar; la UI informa que la revocación remota sigue sin confirmar y el login explícito vuelve a establecer la sesión.
- Producto modular en `frontend/src/product/`; el selector y tres prototipos F1 siguen aislados en `/prototipos`.

## Estructura y contratos

`ProductApp.tsx` arma rutas y shell. `api.ts` implementa cliente same-origin, `no-store`, access JWT en memoria, refresh HttpOnly, CSRF, refresh concurrente singleflight y descarte de respuestas privadas de sesiones anteriores. `PublicPages.tsx`, `ReferencePage.tsx`, `BenefitsPages.tsx`, `ConsumptionPage.tsx` y `JourneyPage.tsx` separan los flujos; `qr-intent.ts` gestiona secretos de QR efímeros y `navigation.tsx` el enrutado de producto.

La integración sigue los contratos de `/api/v1/auth/*`, `/api/v1/referrals/redeem/`, `/api/v1/me/folders/`, `/api/v1/folders/<collaborator_id>/providers/`, `/api/v1/folders/<collaborator_id>/providers/<provider_id>/`, `/api/v1/consumptions/`, `/api/v1/me/wallet/`, `/api/v1/me/progress/` y `/api/v1/me/consumptions/`. Los headers/credenciales se mantienen same-origin; `Idempotency-Key` se envía al acreditar, y `X-CSRFToken` a mutaciones de autenticación. Las rutas privadas y estados de autorización pertenecen al servidor. Referencias: [E2](../../../docs/plans/02-autenticacion-api.md), [E3](../../../docs/plans/03-comercios-colaboradores.md), [E4](../../../docs/plans/04-consumos-creditos.md), [contrato API](../../../docs/api.md).

## Pruebas y resultados

Versión fijada: Node 24.19.0, pnpm 11.22.0. `pnpm install --frozen-lockfile` — OK, lockfile intacto.

- `pnpm run lint` — OK tras corregir el inicializador del aviso de logout.
- `pnpm run typecheck` — OK (`tsc -b --pretty`).
- `pnpm test` — OK: proxy 1/1; Vitest 4 archivos y 25 tests; prototipos F1 2/2. Incluye refresh singleflight, verificación one-use bajo `StrictMode`, lectura/limpieza del fragmento, reintento de consumo con clave idempotente, origen no permitido, descarte tardío tras logout, logout remoto no confirmado, registro sin rol autoseleccionable, carpeta revocada sin petición de prestadores y Mi viaje con API simulada.
- `pnpm run build` — OK; compilación Vite de 42 módulos.
- `pnpm audit` — **no aprobado localmente**. Error exacto del cliente: `POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk error (EACCES). Will retry...`, luego `[ERROR] fetch failed TypeError: fetch failed`, sin código HTTP. No se agregaron dependencias y el lockfile no cambió; CI debe ejecutar la auditoría. No se repitieron intentos amplios por ser fallo de conectividad del entorno.
- Backend sin cambios. Compose principal ya existente se inició con `scripts/dev.ps1 up -Demo`; migraciones y seed terminaron, conservando cuentas, DB y volúmenes. `GET http://localhost:8000/api/v1/health/` — HTTP 200 `{"status": "ok"}`. Preview `http://localhost:5173/` — HTTP 200 text/html. Se corrigió `frontend/Dockerfile` para lanzar Vite con `--host 0.0.0.0`; el anterior `pnpm run dev -- --host` impedía acceder desde el host.

## Separación de verificación real y simulada

**Servidor real comprobado:** el health API responde 200 y la portada frontend local responde 200. No hubo cambios ni tests nuevos del backend. En navegador real, el controlador verificó el registro de cuentas de prueba, correo de verificación recibido por Mailpit, redención de referencia desde QR directo, acceso autorizado a carpeta/prestador/detalle/condiciones, y rechazo/estado vacío tras cerrar sesión o cambiar a una cuenta sin carpeta. El primer enlace de verificación mostró error; la lectura de estado/conteo en PostgreSQL confirmó cuenta verificada y único token VERIFY consumido. `<React.StrictMode>` en `main.tsx` y el efecto que enviaba POST directamente explicaban la solicitud duplicada; el cliente ahora comparte una sola solicitud. El controlador registró una segunda cuenta y abrió su primer enlace Mailpit en pestaña nueva: fragmento retirado y UI confirmó email verificado, verificando el arreglo. También comprobó logout real sin datos privados, QR de consumo directo, PIN, acreditación real exitosa y Mi viaje consultado al servidor: saldo 1.000 créditos y una visita de meta 5. Sin exponer información personal o secretos; la evidencia detallada está en [reporte CUA](./f2-browser-report.md).

La revisión visual desktop confirmó hero correcto sin desborde a 1440 (ancho documento 1425). A 320 px, `body{min-width:320px}` más el scrollbar de Windows imponía 15 px de scroll; al retirar ese mínimo el viewport disponible se hizo 305 px. Se apilaron encabezado y sello de Mi viaje en mobile, y se redujo/fluidificó el heading de beneficios para que texto de negocios largos quepa sin recortar ni ocultar contenido. Tras repetir medición real, home, login, estado vacío de beneficios, listado, ficha y Mi viaje midieron `clientWidth=305` y `scrollWidth=305`; sello de Mi viaje quedó dentro del contenedor. La nav autenticada Mi viaje/Beneficios quedó visible y operable en 320 px; el logo mide 57 px de alto. Se corrigió `document.title` de producto y el controlador lo confirmó post-reload. Vite usa polling para bind mounts Windows. RTL a viewport simulado solo verifica la presencia semántica de enlaces; las medidas y visibilidad CSS provienen del navegador real.

**Mock de frontend:** todos los tests Vitest de producto usan respuestas de API simuladas; los 2 tests Node de F1 prueban el demo aislado. No se presenta evidencia mock como integración de negocio real.
