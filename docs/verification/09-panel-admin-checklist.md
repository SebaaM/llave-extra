# Checklist del panel administrativo

Actualizado el 26/10/2026. Estado real de la etapa; las casillas pendientes no representan comprobaciones terminadas. Evidencia detallada en [verificación](09-panel-admin.md).

## Diseño y servidor

- [x] Aprobar el panel React integrado y el alcance sin analíticas.
- [x] Preparar la rama y el entorno aislado PostgreSQL/Redis.
- [x] Implementar configuración general, catálogo/red, créditos y retiro.
- [x] Verificar y aprobar permisos, auditoría, idempotencia y conflictos comunes.
- [x] Implementar usuarios, prestadores, beneficios, colaboradores y selecciones concretas.
- [x] Implementar gestión de consumos, créditos, productos, stock, pedidos y cancelaciones.
- [x] Implementar dashboard operativo, actividad, medios y QR privados e invitaciones.
- [x] Probar los trece recursos por HTTP real, con cuentas sintéticas y control de roles.
- [x] Corregir versiones relacionadas y contratos OpenAPI tras revisión independiente.
- [x] Agregar pruebas PostgreSQL de concurrencia frente a consumo, compra y cancelación.
- [x] Aprobar la última corrección de la prueba concurrente en revisión focal.
- [x] Repetir la suite backend completa: 266 pruebas aprobadas sobre PostgreSQL/Redis.

## Panel React

- [x] Integrar ingreso y navegación hacia `/gestion`.
- [x] Construir menú lateral, dashboard y bandejas con información real.
- [x] Conectar búsquedas, filtros, paginación, fichas y formularios de gestión.
- [x] Conectar acciones operativas, confirmaciones y motivos obligatorios.
- [x] Construir las cuatro pestañas de configuración y la vista previa de red.
- [x] Reflejar textos y contactos guardados en la portada y el pie público.
- [x] Cerrar protección de cambios sin guardar, reintentos, sesión y respuestas tardías tras las correcciones.
- [x] Aprobar pruebas, lint, tipos y compilación del frontend.
- [x] Aprobar la revisión independiente del frontend, con observaciones menores para la revisión final.
- [x] Corregir y revisar versiones de formularios, comandos inciertos e invitaciones pendientes.
- [x] Corregir y revisar precios con centavos, movimientos paginados, retiro de imágenes y etiquetas de fichas.

## Verificación y entrega

- [x] Revisar ingreso, dashboard, listados, formulario y diseño de 320 px en navegador.
- [x] Comprobar guardados, stock, menú y centavos con React y API HTTP real: cinco pruebas aprobadas.
- [x] Comprobar errores, permisos, conflictos y cambios de sesión mediante las suites y QA HTTP.
- [ ] Completar clics y archivos en navegador nativo, afectados por el bloqueo del diálogo de la herramienta.
- [x] Ejecutar las comprobaciones pertinentes del producto integrado: 266 backend, 100 interfaz, 1 proxy y 5 integradas.
- [ ] Cerrar revisión independiente de toda la rama.
- [x] Aplicar migraciones locales con respaldo y conteos conservados, sin cargar semillas.
- [ ] Actualizar contexto, pendientes, instrucciones y contrato.
- [ ] Publicar y adjuntar el PR hacia develop y comprobar CI, sin fusionarlo.

Las analíticas, la tienda del Cliente, el sandbox externo de pagos y el despliegue productivo quedan para sus etapas correspondientes.
