# Ajustes de la vista del Cliente — 30/10/2026

Diseño aprobado por el usuario e implementado en la misma rama `feature/frontend-cliente-visual`; entrega en [PR #16](https://github.com/SebaaM/llave-extra/pull/16) hacia `develop`, en borrador y sin fusionar. [Diseño](../superpowers/specs/2026-10-30-ajustes-vista-cliente.md) y [plan](../superpowers/plans/2026-10-30-ajustes-vista-cliente.md).

## Antes y después

| Área | Antes | Después |
| --- | --- | --- |
| Lenguaje | La experiencia del Cliente hablaba de prestadores, colaboradores, carpetas y referencias. | Habla de negocios, visitas y recomendaciones recibidas. El Cliente explora y utiliza beneficios; las selecciones las gestionan exclusivamente los colaboradores. |
| Recomendaciones | El menú ofrecía la sección incluso sin beneficios disponibles. | Pantalla propia y accesos visibles al confirmar una selección autorizada con beneficios; carga, error y selección vacía diferenciados. |
| Navegación | Barra inferior también en escritorio. | Navbar en escritorio; barra inferior solo hasta 680 px. Un único conjunto de enlaces y foco conservado. |
| Red | Botones para alternar Red/Lista. | Red en escritorio y lista en móvil de forma automática, conservando página y ficha al cambiar tamaño. |
| Inicio | Secciones intercaladas y un solo destacado fijo. | Hero → Red → En tu recorrido → Próxima parada → Mapa → Pasaporte; carrusel manual con controles y selección de beneficio. |
| Recorrido | La explicación daba demasiado protagonismo a los roles y al QR de recomendaciones. | Explica explorar, visitar y sumar sellos; permite usar beneficios con o sin recomendaciones recibidas. |
| Pasaporte | Sellos en tarjetas con un símbolo genérico. | Libreta abierta de dos páginas en escritorio y papel adaptable en móvil; mini sellos con iniciales del nombre actual del negocio. Conserva historial, créditos y barra de visitas. |

Los sellos usan el nombre que ya entrega el historial propio; no buscan logos ni datos privados en el catálogo. El enlace de Recomendaciones requiere comprobar disponibilidad mediante la primera página privada por selección recibida: se agregan esas lecturas al refrescar accesos, sin recorrer todo el catálogo ni persistir datos. La descripción predeterminada antigua se adapta de forma exacta a la nueva terminología; los textos personalizados se conservan.

## Verificación

- Commits de navegación/red: `f3dc517`, `f5eca32` y `7852c3e`. Las correcciones responden a revisiones independientes de respuestas tardías y recarga de la selección vigente. Último grupo pertinente: 64 pruebas aprobadas.
- Inicio/pasaporte: `06afb43`, revisión independiente aprobada. Pruebas RED verificadas antes del cambio y pruebas focales posteriores aprobadas.
- Suite de B `pnpm test -- --reporter=dot`: 303 pruebas UI en 25 archivos y 1 prueba del proxy aprobadas. La suite anterior de A tuvo tres expectativas antiguas de textos QR, corregidas y verificadas antes de esta suite. Persisten avisos conocidos de jsdom sobre navegación a otro documento.
- La revisión integral identificó dos casos de contenido privado obsoleto: revalidación local de otra generación y respuesta de red privada con total cero que no retiraba tarjetas. Se reprodujeron tres fallos antes de corregirlos y se conservó un control de página vacía con total positivo. Corrector único `1ff72fd`: pruebas focales 75/75 y suite final `pnpm test` sobre fuente definitiva con 308 pruebas UI en 26 archivos y 1 del proxy aprobadas; lint, tipos y build también aprobados. Su delta fue aprobado por revisión independiente, sin hallazgos pendientes de código.
- `pnpm run lint`, `pnpm run typecheck` y `pnpm run build`: aprobados. Build final después del corrector: 416.677 bytes JS / 124.073 bytes gzip y 93.004 bytes CSS / 18.483 bytes gzip; se midió con `node:zlib` sobre `dist/assets`. Continúa dentro del presupuesto inicial de incremento de 20 KiB gzip en JS.
- QA real en navegador integrado con muestras sintéticas: escritorio 1440×900, móvil 390×844 y 320×740. Navbar estático en escritorio y barra fija móvil; red/lista automática sin selector. Ancho cliente/desplazable 1425/1425 en escritorio, 375/375 a 390 y 305/305 a 320; sin desborde horizontal en las pantallas observadas.
- Carrusel cambia beneficio y conserva foco; orden de las seis secciones comprobado; Historial/Pasaporte alternan. Libreta móvil de 277 px a 320, barra con controles de 52 px de alto y texto de Recomendaciones completo. Se corrigió el contraste del rótulo del hero tras observación visual.

Las comprobaciones de autorización y respuestas tardías son pruebas automatizadas con respuestas sintéticas; este ajuste no repitió revocación HTTP real ni consumo real por QR. No cambió backend, contratos OpenAPI, migraciones ni reglas de consumo. La regresión previa de créditos e historial sobre PostgreSQL/Redis aprobó 27 pruebas; no se presenta como una ejecución nueva de este ajuste. No se validan safe areas físicas de dispositivos, zoom 200% ni pagos externos en esta entrega.

La revisión integral de la rama y la revisión de su corrector se completaron. La revisión documental también confirmó la coherencia entre contexto, instrucciones, plan y evidencia. El navegador integrado dejó de responder al intentar una observación adicional posterior; ese intento no se registra como nuevo QA. La aprobación final del cliente sigue pendiente y no se autoriza fusionar la PR.
