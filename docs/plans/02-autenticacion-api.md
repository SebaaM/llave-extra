# E2 — Autenticación y referencias privadas

E2 incorpora registro público exclusivamente para `TOURIST`, login, verificación de email, recuperación de contraseña, sesiones JWT revocables y acceso a una referencia privada mediante QR de colaborador habilitado. El QR representa una capacidad de referencia a carpeta; no acredita consumos de un prestador.

Los roles `ADMIN`, `PROVIDER`, `COLLABORATOR` y `TOURIST` permanecen separados. El administrador crea y habilita perfiles de colaborador en Django Admin; el colaborador obtiene únicamente su QR actual. El turista puede conservar grants históricos de varias referencias, pero la API solo muestra los vigentes. La baja, rotación o cambio de rol suspende el acceso sin borrar el historial.

El backend valida cada solicitud con `active_folder_access(user, profile)`; E3 debe aplicarlo al listado y detalle de carpeta y prestadores. E4 debe usar `locked_folder_access(user, profile_id)` dentro de su transacción para serializar la elegibilidad con la baja o rotación.

El contrato para la futura UI requiere access token en memoria y refresh en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción. El QR lleva el token firmado en el fragmento de `/referencia#token=...`; F1 deberá limpiar el fragmento con `history.replaceState` antes de cargar recursos externos y enviarlo únicamente en el cuerpo del POST. El QR es compartible por quien lo posea; el administrador puede revocarlo deshabilitando o rotando el perfil. E2 no conecta una interfaz funcional antes de elegir un prototipo.

Las rutas, estados y errores están en [el contrato API](../api.md). La validación local usa PostgreSQL y Redis reales. Mailpit prueba entrega SMTP local; no hay garantía de entrega externa ni worker de reintentos. Si falla el envío inicial, la cuenta queda creada y puede usar reenvío; reenvío y reset conservan respuesta genérica.

El proxy de desarrollo Vite transmite la IP del socket cliente en una cabecera que sobrescribe; el backend la acepta solo del host proxy configurado. La API directa ignora cabeceras de origen forjadas. El despliegue con otro proxy debe configurar esa confianza de forma exacta y sanear la misma cabecera en el borde.
