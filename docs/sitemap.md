# Sitemap provisorio

Estado de la interfaz disponible; las rutas privadas requieren sesión y controles del servidor. No es un sitemap XML público.

- `/`: inicio y beneficios destacados.
- `/beneficios`, `/beneficios/<id>`: catálogo y detalle públicos, si están habilitados.
- `/tienda`, `/tienda/<slug>`: catálogo visual de ejemplo; compra y canje en interfaz pendientes.
- `/registro`, `/ingresar`, `/recuperar`, `/restablecer-clave`, `/verificar-email`: cuenta.
- `/referencia`: ingreso de QR de colaborador; `/recomendaciones`: carpeta autorizada del Cliente.
- `/consumo`: acreditación directa o referida; `/mi-viaje`: saldo, historial y progreso; `/perfil`: cuenta del Cliente.
- `/espacio`: deriva al panel correspondiente.
- `/prestador`: resumen con analítica del negocio asignado; `/prestador/negocio`, `/prestador/beneficios`, `/prestador/consumos-referidos`, `/prestador/qr`, `/prestador/cuenta`.
- `/colaborador`: resumen con analítica de la red propia; `/colaborador/recomendaciones`, `/colaborador/catalogo`, `/colaborador/comisiones`, `/colaborador/qr`, `/colaborador/cuenta`.
- `/gestion`: panel Admin; secciones usuarios, prestadores, beneficios, beneficios-destacados, colaboradores, consumos, billeteras, ajustes, productos, pedidos, cancelaciones, reglas-creditos, movimientos-stock, operaciones-pago, actividad y configuracion.
- `/gestion/analitica/visitas`: informe de atribución; `/gestion/analitica/actividad`: informe de actividad financiera. `/gestion/actividad` sigue siendo la auditoría administrativa.
- `/admin/`: Django Admin, sesión independiente.
- `/creditos-imagenes`: fuentes de imágenes.
- `/api/v1/`: API; `/api/v1/health/`: salud; `/api/schema/`: OpenAPI; `/api/docs/`: documentación interactiva.

Ver [contrato API](api.md) para rutas y permisos detallados.
