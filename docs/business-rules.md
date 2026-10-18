# Reglas de negocio implementadas hasta E2

- Solo `ADMIN` gestiona perfiles, habilita/deshabilita colaboradores y rota QR mediante Django Admin. No hay edición de ofertas en E2. `PROVIDER` es un negocio distinto del `COLLABORATOR` referidor.
- Registro público crea únicamente `TOURIST`, rechaza campos de privilegio y exige contraseña validada. Email verificado será requisito de recompensas y canjes en E4, pero un turista pendiente puede explorar una referencia válida.
- Referencia QR firmada por clave separada, con UUID y versión. Una referencia inválida, deshabilitada, antigua o de usuario sin rol colaborador produce rechazo genérico. Un turista puede redimir varias referencias; repetir la misma es idempotente.
- Acceso activo requiere usuario turista activo, usuario colaborador activo y de rol correcto, perfil habilitado y grant de versión actual. La baja, rotación o cambio de rol revoca visibilidad en la próxima solicitud y conserva historial.
- JWT de acceso y refresh tienen vidas de 5 minutos y 7 días. Logout, baja de usuario y cambio de contraseña revocan acceso. Solo una rotación refresh gana ante concurrencia PostgreSQL.
- Redis limita intentos de login, reset, reenvío y redención de QR con contador atómico y TTL. Si Redis falla, estas operaciones se rechazan temporalmente. Email local usa SMTP Mailpit; un fallo del envío inicial se declara y la cuenta puede pedir reenvío.
- El QR de colaborador es un bearer compartible, distinto del QR/PIN de consumo de prestador que se implementará en E4.
