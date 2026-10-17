# Comparador de prototipos F1

Abrí `/prototipos` en el servidor de desarrollo. Cada opción conserva su ruta al refrescar.

| Dirección | Qué mirar | Recorrido sugerido |
| --- | --- | --- |
| [Guía local](/prototipos/guia) | Tono editorial, categorías, buscador y fichas. | Registro → QR → carpeta → búsqueda → ficha. |
| [Pasaporte](/prototipos/pasaporte) | Progreso y próximas paradas. | Registro → QR → carpeta → Mi viaje. |
| [Beneficios](/prototipos/beneficios) | Jerarquía de ahorro y condiciones. | Registro → QR → comparar → ficha. |

Para probar: email con formato válido y contraseña de al menos ocho caracteres; son datos de demostración y no se autentican. Usá `DEMO-FARO` en la entrada QR. `DEMO-PAUSADO` representa una referencia deshabilitada y cualquier otro valor da error. En Mi viaje podés simular verificación de email. En una ficha aún no consumida, el PIN demo `1234` simula la validación del QR del prestador. No ingreses credenciales reales.

La portada no enumera carpetas ni prestadores. El simulador local permite evaluar la experiencia, mientras E2/E3 definirán acceso real en el servidor. El estado demo se limita a la pestaña; un acceso directo nuevo a una ruta privada muestra el gate. Para reiniciar, usá “Cerrar sesión demo” en Mi viaje.

La meta visual inicial es cinco visitas. La cuenta demo arranca en cero; cada primera visita elegible suma 1.000 créditos simulados, sin duplicar el mismo prestador. La tienda muestra productos ilustrativos y distingue pago ARS de canje de créditos; no hay compra real.

**Decisión pendiente: elegir una opción** antes de conectar la API o consolidar la interfaz final.

## Comprobaciones realizadas

En `frontend/`, con Node 24.19.0 y npm 11.17.0:

| Comando | Resultado |
| --- | --- |
| `npm ci` | 178 paquetes instalados; cero vulnerabilidades en el resumen. |
| `npm run lint` | Salida 0, sin errores. |
| `npm run typecheck` | Salida 0. |
| `npm test` | 2 pruebas de QR demo y rutas privadas aprobadas. |
| `npm run build` | Vite 7.3.7; 31 módulos transformados, salida 0. |
| `npm audit --audit-level=moderate` | `found 0 vulnerabilities`, salida 0. |

La auditoría inicial del lockfile E1 reportó diez vulnerabilidades altas: Vite 7.1.12 y dependencias transitivas de `typescript-eslint` 8.46.2. También avisó que ESLint 9.38.0 ya no tenía soporte. Se fijaron React 19.3.1, Vite 7.3.7, plugin React 5.2.0, Tailwind 4.3.3, ESLint 10.13.0, `@eslint/js` 10.0.1, `typescript-eslint` 8.71.2 y plugins compatibles. Las versiones y peer dependencies se consultaron con `npm view` en el registro oficial; [ESLint mantiene su política de soporte](https://eslint.org/version-support/) y [Vite publica las versiones 7.x en npm](https://www.npmjs.com/package/vite). Se actualizó el lockfile sin `--force`.

El logo público vigente se comprobó con `curl --head --location` (HTTP 200, PNG, 55.594 bytes), se inspeccionó y se guardó en `frontend/public/logo-llave-extra.png` para evitar dependencia de red al mostrarlo. La imagen conserva la llave naranja y el wordmark negro. Para texto sobre fondos claros, se midió contraste WCAG: `#F47A0B` sobre `#F7F7F7` da 2,57:1 y queda como acento gráfico; `#D96A05` da 3,26:1 para títulos grandes; `#9C4300` da 6,10:1 para etiquetas pequeñas. En fondo beige se usa también `#9C4300` para texto pequeño.

En navegador local se inspeccionaron `/prototipos` y las tres portadas en escritorio y a 320 px; `document.documentElement.scrollWidth` no superó `innerWidth` a 320 px en ninguna. Se inspeccionó el selector a 1440 px. El flujo probado fue registro con error inline y éxito, QR deshabilitado y válido, acceso directo privado bloqueado antes del QR, búsqueda vacía y ficha, email demo verificado, PIN incorrecto/correcto, 1.000 créditos y 1/5 visitas, recarga conservando acceso, recuperación simulada y bloqueo de ficha después de cerrar sesión. Se vieron capturas en el navegador durante QA, sin guardar archivos de captura. El preview permanece en `http://127.0.0.1:5174/prototipos`.

## Roles y alcance de producto

El Cliente (`TOURIST`) es el usuario principal de las tres alternativas. El Colaborador (`COLLABORATOR`), el Prestador (`PROVIDER`) y el Administrador (`ADMIN`) son roles separados y requieren espacios con accesos y permisos propios. El prototipo actual solo representa el recorrido de Cliente con datos demo; no implementa dichos espacios ni permite elegir una variante por sí mismo.
