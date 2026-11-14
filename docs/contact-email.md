# Correo del formulario de contacto

El correo visible del sitio se configura en Administración. El buzón que recibe el formulario se configura por separado en el servidor con `CONTACT_RECIPIENT_EMAIL`; no se publica en la API ni se toma del cuerpo del formulario. El remitente es `DEFAULT_FROM_EMAIL` y las respuestas se dirigen al visitante mediante `Reply-To`.

## Desarrollo con Mailpit

Usa Docker Compose con `config.settings.local`. Django envía a `mailpit:1025`; si `CONTACT_RECIPIENT_EMAIL` no está definida, usa el destino ficticio `contacto@llaveextra.test`. Una variable definida pero vacía desactiva el formulario. No hace falta agregar datos reales a `.env`. En ejecución nativa, usa `MAILPIT_HOST=127.0.0.1` y el puerto de un servicio local habilitado.

1. Envía una consulta sintética desde `/contacto`.
2. Abre la bandeja de [Mailpit local](http://localhost:8025/) y comprueba asunto, destinatario, remitente, `Reply-To` y cuerpo.
3. Comprueba que un correo inválido no genere otro mensaje. Si Mailpit no está disponible, verifica que el formulario conserve el mensaje para reintentar.

Mailpit confirma captura local; no verifica entrega real. No uses cuentas ni mensajes reales en desarrollo. En un SMTP con resultado incierto (por ejemplo, corte después de aceptar el mensaje), un reintento manual podría enviar un segundo correo.

## Pendiente: configurar el proveedor SMTP de producción

- [ ] Elegir el proveedor y verificar el dominio remitente (SPF, DKIM y DMARC según corresponda).
- [ ] Configurar en la ejecución de producción `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` y `CONTACT_RECIPIENT_EMAIL` (buzón monitoreado).
- [ ] Configurar **un solo** modo según el proveedor: `EMAIL_USE_TLS=true` para STARTTLS o `EMAIL_USE_SSL=true` para TLS implícito, y desactivar explícitamente el otro. `EMAIL_TIMEOUT` fija el tiempo de espera de socket en segundos (5 de forma predeterminada). Mantener secretos fuera de Git.
- [ ] Comprobar aceptación, recepción y respuesta en un buzón autorizado. El cambio de host SMTP también afecta verificación y recuperación de cuentas; probar ambos antes del despliegue.

Producción no usa el destinatario ficticio de desarrollo. Sin un destinatario válido o si el transporte falla, el endpoint devuelve 503. La cuota predeterminada es de 5 intentos por origen cada 15 minutos y 60 envíos intentados globales por hora; ajustar `RATE_CONTACT_ORIGIN_MAX`, `RATE_CONTACT_ORIGIN_WINDOW`, `RATE_CONTACT_GLOBAL_MAX` y `RATE_CONTACT_GLOBAL_WINDOW` si el volumen lo requiere (ventanas en segundos).
