# Traspaso operativo E6

E6 acredita pruebas locales sobre PostgreSQL y el adaptador `fake`; no declara el sitio listo para producción ni habilita compras, canjes o pagos externos.

## Ejecutar una comprobación

Usar solo el laboratorio existente, con su base PostgreSQL aislada y el proveedor `fake`. El comando puntual, perfil, guardas y salida sanitizada están descritos en [Operación de tienda E5](../shop-operations.md#scheduler-de-laboratorio-e6). `--once` ejecuta outbox, vencimientos, reconciliación y diagnósticos; el modo continuo usa 10 segundos para outbox y 60 segundos para vencimientos/reconciliación. No iniciar un proyecto Compose nuevo para esta comprobación.

Después de una interrupción, volver a ejecutar `--once`. Los comandos de tienda conservan las claves, locks e idempotencia de E5. El scheduler solo reporta bloqueos, backlog, pedidos en revisión, diferencias saldo/libro e incidencias o comisiones por pagar; nunca repara historia ni repite automáticamente operaciones bloqueadas. Resolverlas mediante los controles administrativos ya existentes.

Un error de worker aparece como `result=blocked`, sin texto de excepción; una corrida `--once` puede terminar con código cero. Revisar cada línea de estado antes de considerar válida la comprobación.

## Evidencia local

- La restauración T7 se conserva en [la evidencia de operación E6](../verification/18-operacion-e6.md); esta guía no modifica esos datos ni esa evidencia.
- Las pruebas T8 usan PostgreSQL real, datos sintéticos y el proveedor `fake`; no validan una cuenta, dispositivo o integración externa.

## Pendiente antes de producción

- TLS y SMTP públicos, con revisión de registros y configuración real.
- Pruebas en dispositivos físicos y navegadores de operación.
- Destino, acceso, cifrado y retención de respaldos aprobados por el operador.
- RPO/RTO y responsables de recuperación definidos y ensayados.
- Scheduler real autorizado, supervisado y con alertas de bloqueo/backlog.
- Sandbox oficial de pagos completado y contrato externo contrastado con respuestas reales.

Hasta completar esos controles, conservar el proveedor `disabled` en producción. Esta etapa no autoriza despliegues ni una operación financiera real.
