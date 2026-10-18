# Modelo de datos implementado hasta E2

`accounts.User`: identidad única por email normalizado en minúsculas; índice único `Lower(email)` en PostgreSQL. `role` distingue ADMIN, PROVIDER, COLLABORATOR y TOURIST. `email_verified` no equivale a `is_active`; E4 exigirá ambos para acreditar consumos.

`accounts.AuthSession`: UUID por login, FK a usuario, hash SHA-256 del `jti` refresh vigente, fecha de creación y revocación. Cada access JWT lleva `sid` y una huella del hash de contraseña; la autenticación consulta sesión activa y usuario actual. La rotación bloquea fila y reemplaza el único `jti` vigente.

`accounts.OneTimeToken`: hash SHA-256 del token aleatorio, propósito `VERIFY` o `RESET`, vencimiento y uso. El token original solo viaja por email, no se guarda plano. Reset consume el token, cambia contraseña, revoca sesiones y demás tokens de reset en una transacción.

`referrals.CollaboratorProfile`: UUID aleatorio, FK uno a uno a usuario de rol COLLABORATOR, `enabled` falso por defecto, versión QR positiva. El administrador controla habilitación y rotación con bloqueo de fila.

`referrals.FolderAccess`: FK protegidas a turista y perfil, versión QR redimida, fecha de creación, unicidad `(tourist, collaborator, qr_version)`. La fila histórica permanece tras rotación o baja. La autorización usa estado y roles vigentes, nunca la existencia de la fila sola. E3 agregará carpeta real y pertenencia de prestadores; E4 agregará consumos y atribución histórica.
