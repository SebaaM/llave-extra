# Sitemap provisorio

Estado de la interfaz disponible; las rutas privadas requieren sesión y controles del servidor. No es un sitemap XML público.

- `/`: inicio y beneficios destacados.
- `/beneficios`, `/beneficios/<id>`: catálogo y detalle públicos, si están habilitados.
- `/tienda`, `/tienda/<slug>`: catálogo visual de ejemplo; compra y canje en interfaz pendientes.
- `/registro`, `/ingresar`, `/recuperar`, `/restablecer-clave`, `/verificar-email`: cuenta.
- `/referencia`: ingreso de QR de colaborador; `/recomendaciones`: carpeta autorizada del Cliente.
- `/consumo`: acreditación directa o referida; `/mi-viaje`: saldo, historial y progreso; `/perfil`: cuenta del Cliente.
- `/espacio`: deriva al panel correspondiente.
- `/prestador`: resumen; `/prestador/negocio`, `/prestador/beneficios`, `/prestador/qr`, `/prestador/cuenta`.
- `/colaborador`: resumen; `/colaborador/recomendaciones`, `/colaborador/catalogo`, `/colaborador/qr`, `/colaborador/cuenta`.
- `/gestion`: panel Admin; secciones usuarios, prestadores, beneficios, colaboradores, consumos, billeteras, ajustes, productos, pedidos, cancelaciones, reglas-creditos, movimientos-stock, operaciones-pago, actividad y configuracion.
- `/admin/`: Django Admin, sesión independiente.
- `/creditos-imagenes`: fuentes de imágenes.
- `/api/v1/`: API; `/api/v1/health/`: salud; `/api/schema/`: OpenAPI; `/api/docs/`: documentación interactiva.

Ver [contrato API](api.md) para rutas y permisos detallados.
