# Demo de actividad para web y backoffice

Carga **opcional** de datos ficticios, separada de `seed_demo`. No se ejecuta con `up`, `-Demo`, migraciones ni en producción. Genera estados mediante los servicios del dominio; no es un robot de navegación ni una prueba de carga HTTP. La tienda React sigue siendo visual: los pedidos operativos se consultan en backoffice/API.

## Cargar

Con el entorno local iniciado y las migraciones aplicadas, desde otra consola:

```powershell
docker compose exec -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py seed_activity_demo
```

Para más volumen, indicar la cantidad **total deseada**, no cuántos Clientes sumar:

```powershell
docker compose exec -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py seed_activity_demo --customers 1000
```

Admite 20–3000 Clientes; el catálogo permanece fijo. El proveedor fake se selecciona únicamente para ese proceso: no cambia `.env`, no habilita cobros en el servidor y no hace HTTP externo.

Si ya hay configuración de retiro, debe estar habilitada y tener nombre/dirección. Configurarla en `/gestion` antes de cargar. El comando conserva configuración de retiro, regla global de créditos e interruptor del catálogo. En una base nueva sin configuración crea un punto de retiro identificado como ficticio. Un catálogo apagado sigue apagado: sus datos se pueden operar desde el backoffice.

## Datos predeterminados

Cantidades verificadas en una base de pruebas nueva:

| Datos | Cantidad |
| --- | ---: |
| Clientes | 300 |
| Usuarios Prestador / negocios | 30 / 30 |
| Colaboradores | 10 |
| Administradores demo | 1 |
| Beneficios | 60 |
| Productos | 12 |
| Consumos directos/referidos, válidos/anulados | 980 |
| Pedidos | 205 |
| Ajustes pendientes | 20 |

Pedidos: 49 pagados, 26 preparados, 70 entregados, 20 cancelados, 10 pendientes de pago, 9 en revisión, 9 con reintegro pendiente y 12 reintegrados. Incluyen créditos y dinero simulado. Cada billetera coincide con su libro de movimientos y el stock coincide con ajustes menos unidades asignadas a pedidos.

Los negocios incluyen 24 publicados, 3 borradores y 3 inactivos, seis categorías, seis beneficios destacados y propuestas vigentes, vencidas, futuras y borradores. Ocho colaboradores tienen selecciones concretas diferentes; uno está habilitado sin selección y otro deshabilitado. Los productos incluyen activos/inactivos, agotados y pocas unidades.

Fechas transaccionales actuales: no se edita historia inmutable para fingir meses de actividad. Las reservas pendientes vencen por el mecanismo normal de E5 después de 15 minutos; el seed no fuerza EXPIRED. Ver [operación de tienda](shop-operations.md).

## Accesos y recorrido

Contraseñas aleatorias y PIN solo en `docs/activity-demo.local.json`, ignorado por Git. **Conservarlo y no publicarlo.** Contiene `users` (email → contraseña) y `pins` (UUID de negocio → PIN); consola y auditorías no contienen secretos. Los QR se consultan desde las pantallas autorizadas de cada rol.

| Email | Escenario |
| --- | --- |
| `activity.admin.0000@llaveextra.test` | `/gestion`: dashboard, usuarios, red, consumos, billeteras, ajustes, pedidos, cancelaciones, stock y actividad. También `/admin/`. |
| `activity.prestador.0000@llaveextra.test` a `.0029` | Su único negocio, beneficios y credenciales. |
| `activity.colaborador.0000@llaveextra.test` a `.0007` | Selecciones diferentes, QR propio y resumen Admin de clientes/visitas atribuidas. |
| `activity.colaborador.0008@llaveextra.test` | Habilitado sin selección. |
| `activity.colaborador.0009@llaveextra.test` | Deshabilitado. |
| `activity.cliente.0000@llaveextra.test` | Cuenta nueva sin actividad. |
| `activity.cliente.0001@llaveextra.test` | Email sin verificar; sin consumos. |
| `activity.cliente.0002@llaveextra.test` | Cuenta inactiva; sin consumos. |
| `activity.cliente.0003@llaveextra.test` | Consumos, saldo, canje y anulación. |
| `activity.cliente.0004@llaveextra.test` | Canje entregado y ajuste abierto: canjes bloqueados. |
| `activity.cliente.0005@llaveextra.test` | Ajuste resuelto por aporte auditado. |
| `activity.cliente.0006@llaveextra.test` | Ajuste resuelto por condonación. |
| `activity.cliente.0016@llaveextra.test` | Reintegro monetario pendiente. |
| `activity.cliente.0019@llaveextra.test` | Pedido monetario reintegrado. |
| `activity.cliente.0046@llaveextra.test` | Pago confirmado en revisión; inventario conservado. |

Los nombres son ficticios y los negocios/productos indican DEMO. El seed redime QR válidos; el consumo referido conserva selección vigente, QR del negocio y PIN. Los vínculos históricos no sustituyen autorización actual.

## Repetir y retomar

Repetir con el mismo archivo no duplica actividad ni repone stock y conserva publicaciones, selecciones, roles, contraseñas y estados modificados manualmente. Una cantidad mayor agrega Clientes nuevos; una menor no elimina anteriores. Los pasos incompletos se retoman con claves originales. Un lease interrumpido puede requerir esperar hasta 60 segundos.

Solo se procesa la outbox de pedidos propios: no se vacía la outbox global. PostgreSQL rechaza ejecuciones simultáneas; se rechaza una transacción externa. No hay `--reset` que borre historia financiera. La revisión usa servicios y reglas reales, pero fake no valida Mercado Pago.

El archivo está vinculado a una única base. Para otro proyecto Compose, usar una ruta privada diferente desde el principio:

```powershell
docker compose -p llaveextra-demo exec -e SHOP_PAYMENT_PROVIDER=fake backend python manage.py seed_activity_demo --credentials /workspace/docs/activity-demo-otra-base.local.json
```

Las rutas personalizadas deben permanecer ignoradas; `docs/activity-demo*.local.json` está excluido. Una colisión de cuenta/ID ajeno o un archivo de otra base detiene la carga sin sobrescribirlos. Si se pierde el archivo de una carga existente, restaurarlo: no se rotan contraseñas automáticamente.
