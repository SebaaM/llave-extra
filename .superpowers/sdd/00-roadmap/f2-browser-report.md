# QA del controlador F2 (en curso)

Entorno real: Compose principal, frontend http://localhost:5173, API Django/PostgreSQL/Redis y Mailpit local. Todo dato creado para esta prueba es ficticio; no se cambiaron contraseñas, PIN ni carpetas seed existentes. Fixture acotada en `work/qa_f2_fixture.py` ignorado; tokens/PIN no se incluyen en este informe.

- Portada desktop1440x900: hero, propuesta para turistas, CTA cuenta/QR y pasos visibles. DOM innerWidth1440, scrollWidth1425. Captura real inspeccionada.
- Portada móvil320x800: primer Tab enfoca Saltar al contenido; CTA44-48px. La primera comparación innerWidth320/scrollWidth320 era insuficiente: scrollbar Windows deja clientWidth305 y había desborde15px. Regla body min-width320 identificada y corregida; portada/login/beneficios quedaron clientWidth=scrollWidth=305. Hitbox logo42px señalada y corregida a mínimo44.
- Registro real de cliente QA nuevo: formulario email/contraseña, respuesta cuenta creada, correo de verificación recibido por Mailpit. Sin selector de rol.
- Apertura directa QR de colaborador sin sesión en pestaña nueva: fragmento retirado; login conserva intención en memoria; vinculación de referencia aprobada por API. Listado privado, ficha, condiciones, dirección y horarios ficticios visibles.
- Bloqueo1: primer enlace real de verificación desde Mailpit terminó `Enlace inválido o vencido`. Se envió al implementador para investigar ejecución duplicada de efecto bajo StrictMode; pendiente nueva prueba tras corrección, sin resetear credenciales.
- Bloqueo2: viewport599 y320 oculta enlaces Mi viaje/Beneficios autenticados sin menú equivalente. Enviado al implementador para navegación móvil funcional y prueba.
- Detalle título del producto aún Prototipos en tabs iniciales; implementador incorporó corrección pendiente recarga/verificación.

## Resultados posteriores con código actualizado

- Tras reiniciar solo frontend para renovar caché Vite, título del producto correcto. Worker activó polling de desarrollo para bind mounts Windows; no se modificó el backend.
- QR de prestador abierto directamente en pestaña nueva, fragmento retirado, sesión restaurada y carpeta vigente recuperada. PIN ficticio en campo protegido. Acreditación real aprobada; Mi viaje consultó servidor y mostró 1.000 créditos, una visita válida y meta5.
- Logout real volvió a portada sin información privada. Una segunda cuenta QA nueva, registrada por UI, recibió su correo independiente. Su primer enlace abrió pestaña nueva, retiró fragmento y mostró Email verificado. El enlace original consumido no se reutilizó.
- Navegación Mi viaje/Beneficios visible y operable a320 tras corrección; targets44px. Título de Mi viaje correcto. No confundir RTL/JSDOM (estructura) con esta observación real de CSS.
- Login de cuenta2 luego de logout cuenta1: Mi viaje mostró saldo0/visitas0de5, y Beneficios estado sin carpetas, sin ficha/visita de cuenta1. Logout cuenta2 aprobado.
- Desborde residual11px de sello decorativo rotado en Mi viaje corregido con composición móvil; re-QA client305=scroll305, sello dentro del contenedor (right287). Listado real con datos detectó además palabra larga Recomendaciones fuera del heading (scroll404 sin rects fuera); tamaño/quiebre de texto móvil corregidos. Re-QA listado y ficha reales client305=scroll305. No se ocultó contenido funcional para pasar la medición.
- Cierre final: sesión QA cerrada, viewport temporal restablecido y pestañas temporales creadas por el controlador cerradas. Home del producto quedó como entregable visible en5173. No se alteró el worktree/proceso del comparador5174.

QA real de F2 completado para este alcance. Los estados de error/idempotencia/refresh tardío y logout remoto fallido se cubren en pruebas de frontera UI/API, no se afirma haber simulado fallos de red con el servidor real durante esta sesión.

Mercado Pago/tienda/paneles operativos no se probaron aquí: corresponden a E5/F3. No se usaron cuentas reales ni servicios de correo externos.

## Re-QA focal de correcciones de revisión (round1)

Con el código funcional estabilizado por el implementador, se recargó el preview. Cuenta1 inició sesión y Mi viaje mostró sus 1.000 créditos y una visita válida de meta5. Desde enlaces reales home→Tengo un QR→Ya tengo cuenta se inició sesión de cuenta2 sin hacer logout de cuenta1. Durante el envío se observó formulario/loading; al terminar, Mi viaje mostró0 créditos/0 visitas y Beneficios estado sin carpeta. No se observaron ficha ni saldo de cuenta1. Salir volvió inmediatamente a portada sin información privada y se dejó como entregable visible.

Esta prueba confirma integración normal de cambio de cuenta con Web Locks en el navegador actual. No fuerza orden de respuestas, ausencia de LockManager, Blob diferido ni revocación403 en vivo; las pruebas controladas del implementador cubren esos casos y la revisión independiente debe comprobarlas. No se atribuye la prueba mock a tráfico real. Sin cambio de credenciales ni nuevo consumo en esta re-QA.
