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
- [x] Guardar y restituir General por navegador; comprobar portada pública, menú por teclado a 320 px y filtro real de stock.
- [ ] Completar comprobación nativa de archivos, QR y confirmaciones operativas; las pruebas de componentes/API se registran por separado.
- [x] Verificar el corte corregido: 274 backend, 115 interfaz y 1 proxy; HTTP real y QR PNG aprobados.
- [x] Ejecutar revisión integral y cerrar su única ola: tres importantes y nueve menores resueltos; deuda de escala mitigada y documentada.
- [x] Aprobar revisión focal de la única ola de correcciones finales.
- [x] Corregir y revisar QR actual, validación por campo y edición durante guardados pendientes.
- [x] Cerrar correcciones finales de navegación, accesibilidad, recarga, cancelaciones e identidad de actividad.
- [x] Aplicar migraciones locales con respaldo y conteos conservados, sin cargar semillas.
- [x] Actualizar contexto, pendientes, instrucciones y contrato; simplificar Markdown y revisar datos sensibles.
- [x] Excluir todos los `*.diff` de Git y comprobar que ninguno esté versionado.
- [x] Publicar [PR #12](https://github.com/SebaaM/llave-extra/pull/12) hacia develop y consultar sus comprobaciones, sin fusionarlo. Estado de CI vigente en el PR.

Las analíticas, la tienda del Cliente, el sandbox externo de pagos y el despliegue productivo quedan para sus etapas correspondientes.
