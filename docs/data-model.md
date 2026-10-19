# Modelo de datos implementado hasta E4

`accounts.User`: identidad única por email normalizado en minúsculas; índice único `Lower(email)` en PostgreSQL. `role` distingue exactamente cuatro valores: `ADMIN`, `PROVIDER`, `COLLABORATOR` y `TOURIST`; este último representa al Cliente, usuario principal, sin crear un quinto rol. `email_verified` no equivale a `is_active`; E4 exige ambos para acreditar consumos.

`accounts.AuthSession`: UUID por login, FK a usuario, hash SHA-256 del `jti` refresh vigente, fecha de creación y revocación. Cada access JWT lleva `sid` y una huella del hash de contraseña; la autenticación consulta sesión activa y usuario actual. La rotación bloquea fila y reemplaza el único `jti` vigente.

`accounts.OneTimeToken`: hash SHA-256 del token aleatorio, propósito `VERIFY` o `RESET`, vencimiento y uso. El token original solo viaja por email, no se guarda plano. Reset consume el token, cambia contraseña, revoca sesiones y demás tokens de reset en una transacción.

`referrals.CollaboratorProfile`: UUID aleatorio, FK uno a uno a usuario de rol COLLABORATOR, `enabled` falso por defecto, versión QR positiva. El administrador controla habilitación y rotación con bloqueo de fila.

`referrals.FolderAccess`: FK protegidas a Cliente (`TOURIST`) y perfil, versión QR redimida, fecha de creación, unicidad `(tourist, collaborator, qr_version)`. La fila histórica permanece tras rotación o baja. La autorización de la carpeta usa estado y roles vigentes, nunca la existencia de la fila sola. El consumo directo no necesita `FolderAccess`.

`providers.Provider`: UUID, ID público legado opcional único, slug, ficha y contacto opcional, imagen privada, estado `DRAFT/PUBLISHED/INACTIVE`, marca `demo` y URL pública de procedencia. La publicación la decide Admin. `providers.ProviderMembership`: relación única `(user, provider)` para un usuario de rol PROVIDER; no se autoasigna.

`providers.FolderProvider`: relación única `(collaborator, provider)` que define la carpeta curada. Solo Admin la cambia. Insertar/borrar bloquea primero perfil y luego prestador. Grant y pertenencia deben ser actuales para E4.

`providers.Benefit`: UUID, prestador, título, descripción y condiciones legibles, fechas de vigencia opcionales, imagen privada, estado y procedencia demo. Restricciones PostgreSQL impiden intervalo invertido y publicación con título o condiciones vacíos. La vista turística también comprueba fechas actuales. El prestador crea borradores; editar una oferta publicada la devuelve a borrador.

`providers.DemoSeedState`: marca persistente de carga inicial del inventario saneado. Repetir `seed_demo` no repone asignaciones ni sobrescribe decisiones administrativas, incluidas las eliminaciones.

`providers.CatalogConfig`: singleton `singleton=1` con restricción PostgreSQL; `enabled=true` por defecto y fila creada por migración. Solo el Admin superusuario activo puede cambiarlo en Django Admin; no permite borrado desde el modelo ni el backoffice. Controla únicamente la superficie pública del catálogo, nunca las referencias privadas o consumos.

`credits.Consumption`: UUID, Cliente y Prestador protegidos, `collaborator` protegido y anulable para consumos directos, premio y regla histórica, estado y auditoría de anulación. Unicidad PostgreSQL `(tourist, provider)` durante todo el programa. El trigger impide cambios de identidad, atribución, premio y snapshot, incluso transiciones de `NULL` en `collaborator_id`; solo permite la anulación auditada. La migración 0008 hace anulable la FK sin reescribir consumos anteriores.

`credits.ConsumptionIdempotency`: clave única `(actor, operation, key)`, huella HMAC de la solicitud y respuesta confirmada. `credits.Wallet` conserva saldo no negativo y bloqueo de canjes; `credits.WalletEntry` es un libro inmutable de movimientos con referencia única. La acreditación escribe consumo, premio, movimiento e idempotencia en una transacción, bajo bloqueos de Cliente, perfil referido si existe, Prestador, beneficio vigente, regla y Wallet.
