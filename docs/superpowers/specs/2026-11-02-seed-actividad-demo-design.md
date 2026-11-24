# Seed opcional de actividad completa

Pedido aprobado: comando independiente y carga mayor, incluidos consumos y actividad suficiente para probar el backoffice. Se adopta una base de 300 Clientes, 30 negocios y 10 colaboradores; `--customers` permite 20–3000 Clientes. No se ejecuta durante el arranque ni durante migraciones.

Alternativas: ampliar `seed_demo` simplifica el comando histórico pero cambia su alcance; el usuario eligió `seed_activity_demo` independiente. Los seeds anteriores se conservan.

Datos ficticios en un namespace propio: cuatro roles, publicaciones/vigencias/destacados, selección concreta por colaborador, accesos por QR, unos 1200 consumos según tamaño, saldos, anulaciones, ajustes abiertos/resueltos, productos y pedidos de créditos/dinero en distintos estados. Los Clientes nuevos, inactivos y sin verificar no reciben consumos. Pedidos monetarios solo con DEBUG y fake explícito; se procesan exclusivamente sus operaciones con FakeGateway, sin HTTP externo ni cambios globales de configuración.

Servicios canónicos para selección, redención QR, consumos, créditos, canjes, stock, cancelaciones, preparación, retiro y pagos. No se editan saldos/stock absolutos ni historia inmutable. Fechas transaccionales actuales: las reservas pendientes vencen naturalmente tras 15 minutos con el comando existente. No se inventa un histórico de meses ni se declara probada una integración externa.

Carga reanudable por pasos, protegida por advisory lock PostgreSQL. Namespace y marcadores versionados; las repeticiones conservan cambios manuales posteriores. Colisiones ajenas se rechazan. Contraseñas/PIN aleatorios solo en archivo local ignorado, escrito antes del commit de cuentas para recuperar interrupciones. No se rotan cuentas existentes ni se escriben secretos en auditorías/resultados persistidos. Configuración singleton existente se conserva; si impide la demo se indica la precondición en vez de cambiarla silenciosamente.

Salida: resumen de cantidades/estados y guía para recorrer los escenarios con accesos locales. La tienda React sigue visual; los pedidos operativos se prueban en backoffice/API. Validación PostgreSQL/Redis aislados, idempotencia financiera, interrupción/reanudación, colisiones, aislamiento, estados y prohibición de HTTP real. No cargar la base principal al implementar.
