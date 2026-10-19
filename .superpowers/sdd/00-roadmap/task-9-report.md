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

`ProductApp.tsx` arma rutas y shell. `api.ts` implementa cliente same-origin, `no-store`, access JWT en memoria, refresh HttpOnly, CSRF, refresh concurrente singleflight y descarte de respuestas privadas de sesiones anteriores. Las mutaciones de cookie refresh (refresh/login/logout) usan Web Locks por origen y esperan la respuesta completa. `PublicPages.tsx`, `ReferencePage.tsx`, `BenefitsPages.tsx`, `ConsumptionPage.tsx` y `JourneyPage.tsx` separan los flujos; `qr-intent.ts` gestiona secretos de QR efímeros y `navigation.tsx` el enrutado de producto.

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

## Correcciones de la revisión F2 — round 1

- **Transición A→B y logout:** comenzar el login limpia el estado privado de React antes de enviar credenciales; la pantalla de B solo se muestra después de limpiar y asociar identidad. Carpetas, prestadores, saldo/progreso e historial se aplican solo si coinciden la versión de sesión e identidad capturadas al iniciar la carga. El logout limpia usuario y datos privados al pulsar Salir, antes de esperar la respuesta remota. Un logout no confirmado sigue comunicándose como pendiente de revocación.
- **Cookie compartida entre pestañas:** refresh, login y logout pasan por Web Locks con el mismo nombre de lock por origen y un callback que permanece pendiente hasta recibir/procesar la respuesta. Así, si refresh de A ya está en curso cuando se solicita login de B, el `Set-Cookie` de refresh termina antes de enviar el login nuevo. Las respuestas de refresh también verifican `sessionVersion`; una respuesta vieja nunca repone el access JWT. Para navegadores/entornos sin `navigator.locks` —incluida una conexión no segura sin secure context— la autenticación falla cerrada con un mensaje claro y no envía refresh, login ni logout. La cola local conserva orden dentro de una pestaña, y Web Locks aporta coordinación real entre pestañas del mismo origen ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [W3C](https://www.w3.org/TR/web-locks/)). El marcador de logout que evita una restauración silenciosa continúa en `sessionStorage`: representa esta pestaña y no promete revocar las demás sesiones del dispositivo.
- **Imagen privada tardía:** `privateImage` revisa la versión de sesión después de leer el Blob, antes de crear una Object URL. `PrivatePhoto` revoca cualquier URL resuelta después de desmontarse y la de la imagen anterior al desmontaje.
- **Cambio/revocación de carpeta:** al elegir otra carpeta se vacían inmediatamente lista y ficha; las respuestas de listados y detalle se descartan si su identidad, sesión o carpeta ya no coincide. Un 401/403 en beneficios retira la ficha completa y refresca las carpetas/listado autorizados, evitando retener los datos privados de comercio.
- **Legibilidad:** se expresaron los flujos de rutas, sesión, errores y fichas en bloques separados; no se comprimieron nuevamente para el parche.

### Verificación round 1

- `pnpm exec vitest run src/product/api.test.tsx src/product/ProductApp.test.tsx src/product/PrivatePhoto.test.tsx --reporter=dot` — OK: 3 archivos, 15/15 tests. Incluye orden adverso refresh A/login B y lock compartido, fail-closed sin LockManager, A→B con login diferido, logout con respuesta remota diferida, respuestas tardías de carpeta, revocación 403 y Object URL tras desmontaje.
- `pnpm test` — OK: proxy 1/1, Vitest 5 archivos y 31/31 tests, prototipos F1 2/2.
- `pnpm lint` — OK.
- `pnpm exec tsc --noEmit` — OK.
- `pnpm build` — OK; Vite compiló 42 módulos. En esta sesión tanto Vitest como Vite requirieron ejecución elevada porque esbuild bloqueaba `vite.config.ts` con `Acceso denegado` desde el sandbox de Windows; los comandos completos pasaron elevados.
- Sin paquetes nuevos ni cambios en `pnpm-lock.yaml`. No se repitió `pnpm audit`; el lockfile no cambió y el error de red local ya documentado sigue pendiente de CI.
- Re-QA navegador/API real del controlador tras los cambios: cuenta 1 mostró saldo 1.000 y progreso 1/5; desde home se navegó a Tengo QR, al ingreso y se autenticó la cuenta 2 sin logout previo. Durante el envío solo se mostró el formulario/loading; después, Mi viaje mostró 0/0 y Beneficios indicó que no había carpeta, sin saldo ni ficha de cuenta 1. Salir volvió inmediatamente a portada. No se simularon demoras de red/cookie, Blob tardío ni 403 en el navegador; esos órdenes se cubren con los tests de frontera simulados anteriores. Home quedó como preview entregable.

## Correcciones de la revisión F2 — round 2

- **Login y refresh sin deadlock:** `authenticate` mantiene la serialización local y el Web Lock de origen solo durante el `POST /auth/login/`, hasta procesar su respuesta y `Set-Cookie`; valida la versión de sesión y asigna el JWT. Luego libera el lock antes de pedir `/auth/me/`. Si `/me` recibe 401, el refresh puede adquirir la misma coordinación en vez de quedar esperando a que termine el login que a su vez espera al refresh. La comprobación posterior de `sessionVersion` sigue impidiendo completar el login si otra transición local sustituyó la sesión.
- **Falta de Web Locks visible en el formulario:** el catch del formulario de autenticación conserva `AuthCoordinationError` y presenta el requisito de navegador actualizado/contexto seguro, en lugar del mensaje genérico de conectividad. La función sigue fallando cerrada sin enviar una mutación de autenticación.

### Verificación round 2

- `pnpm exec vitest run src/product/api.test.tsx src/product/ProductApp.test.tsx` — OK: 2 archivos, 16/16 tests. El caso focal de API envía login 200, recibe `/me` 401, ejecuta refresh 401 y termina con el error 401 en vez de colgarse. El recorrido de formulario sin `navigator.locks` muestra el requisito de coordinación y confirma cero llamadas a `fetch`. Estas pruebas son simuladas; no representan una prueba de navegador del orden real de `Set-Cookie`.
- Ciclo red/green focal: con el comportamiento anterior, `pnpm exec vitest run src/product/api.test.tsx src/product/ProductApp.test.tsx -t "libera el Web Lock|explica el requisito" --reporter=dot` falló como esperado: API agotó 5.000 ms y el formulario mostró el aviso falso de conectividad; con ambos arreglos, la suite focal completa volvió a pasar 16/16.
- `pnpm run lint` — OK.
- `pnpm run typecheck` — OK (`tsc -b --pretty`).
- `pnpm run build` — OK; Vite compiló 42 módulos. Vitest/build necesitaron ejecución elevada en Windows por `esbuild` (`Acceso denegado` al leer `vite.config.ts`) dentro del sandbox; los comandos elevados concluyeron correctamente.
- No se cambió backend, contrato API, dependencias ni `pnpm-lock.yaml`; no se repitió la auditoría local de red ya documentada. El QA navegador/API real anterior del controlador sigue documentado en `f2-browser-report.md`; no se repitió durante esta ronda, que cambió solo el orden frontend de login y el mensaje de coordinación.
