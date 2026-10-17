# Llave Extra

Red de beneficios turísticos de Ushuaia. Los **prestadores** ofrecen beneficios; los **colaboradores** refieren turistas a una carpeta de prestadores mediante un QR único habilitado por el administrador. Las carpetas no son públicas.

## Desarrollo por etapas

El [plan de implementación](docs/plans/00-roadmap.md) define entregables, verificaciones y dependencias. El [contexto](CONTEXT.md) conserva las decisiones funcionales y [AGENTS.md](AGENTS.md) las reglas de trabajo.

Cada etapa se entrega en un pull request independiente. Los PR dependientes se apilan sobre la rama de la etapa anterior y deben integrarse en orden. No se fusionan automáticamente.

## Inicio local

Requisitos: Git y Docker con Compose. Desde PowerShell, ejecutá `./scripts/dev.ps1 up -Demo`; desde macOS/Linux, `./scripts/dev.sh up --demo`. El primer arranque crea `.env` con secretos locales y valores de desarrollo, construye los contenedores y aplica migraciones. El archivo `.env` está ignorado por Git.

Aplicación: <http://localhost:5173>. API y OpenAPI: <http://localhost:8000/api/v1/health/> y <http://localhost:8000/api/schema/>. Documentación interactiva: <http://localhost:8000/api/docs/>. Mailpit: <http://localhost:8025>.

Las contraseñas generadas de las seis cuentas demo se guardan en `docs/cuentas-prueba.local.md`, un archivo local ignorado por Git. El seed es idempotente y conserva contraseñas y datos de usuarios existentes. Para parar sin borrar datos: `./scripts/dev.ps1 down` o `./scripts/dev.sh down`. Para pruebas: `./scripts/dev.ps1 test` o `./scripts/dev.sh test`.

## Roles

- `ADMIN`: administra usuarios, carpetas, colaboradores, QR y reglas.
- `PROVIDER`: prestador/negocio; es distinto del colaborador.
- `COLLABORATOR`: refiere turistas a prestadores de su carpeta asignada.
- `TOURIST`: consulta beneficios tras obtener acceso por QR autorizado.

E1 entrega solo la base técnica y no implementa todavía autenticación, catálogo ni operaciones de negocio. Las integraciones futuras de pagos y correo no se consideran validadas ni activas.
