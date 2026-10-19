# Corrección aprobada: catálogo, referencias y GitFlow

Solicitud del usuario del 19/10/2026. Prevalece sobre las restricciones históricas de catálogo privado.

- El catálogo general de beneficios es público y alimenta la portada. Solo muestra beneficios publicados y vigentes de prestadores publicados. Las fechas límite son inclusivas según la fecha local del servidor. Los datos demo se identifican expresamente.
- Las carpetas, recomendaciones, asignaciones y QR de colaboradores siguen siendo privados. Acceder a una recomendación exige el QR habilitado, su versión vigente y autorización del servidor. El catálogo público no revela esas relaciones.
- Solo el administrador puede habilitar/deshabilitar el catálogo general desde el backoffice. El interruptor afecta portada, listados, detalles y medios públicos del servidor; no revoca recomendaciones privadas ni impide validar un consumo presencial por QR/PIN. Si está deshabilitado se explica la disponibilidad por recomendaciones, sin mostrar datos públicos previamente cargados.
- El cliente puede acreditar consumos sin colaborador, confirmado expresamente por el usuario. `folder_id` es opcional. Si se proporciona, se valida y bloquea la referencia vigente y la pertenencia del prestador; una referencia inválida no se degrada silenciosamente a consumo directo. Sin carpeta se registra `collaborator=null`. No se inventa atribución ni se toma una carpeta histórica automáticamente.
- Todo consumo sigue exigiendo cliente activo, email verificado, prestador publicado con beneficio vigente, QR/PIN válido, límites compartidos, idempotencia y una única acreditación por cliente/prestador durante todo el programa. La regla de créditos, el historial y el libro financiero siguen siendo inmutables; conservar restricciones y triggers PostgreSQL.
- La portada conserva identidad, colores y fuentes, promueve beneficios reales de la API y permite consultar el catálogo completo. No inventar porcentajes ni promociones. Las recomendaciones QR tienen navegación propia y Mi viaje conserva el pasaporte.
- Se retiran los tres prototipos, sus rutas, pruebas y código exclusivo. Conservar los recursos compartidos de marca y el producto actual; no borrar worktrees o archivos locales de otras tareas.
- El administrador debe poder acceder al backoffice Django sin recarga infinita, con sus mecanismos de sesión y CSRF. No pasar JWT por URL ni confundir sesión API con sesión Django.
- GitFlow obligatorio: `main` estable, `develop` integración, `feature/*`, `release/*` y `hotfix/*`. No fusionar PRs desde este trabajo. Bootstrap: `develop` parte de `415f235` (base revisada de E4+F2); los PRs históricos abiertos se conservan. Esta corrección va a `feature/catalogo-publico-admin` y su PR tiene base `develop`.
- Stack y herramientas existentes sin cambios: Django/DRF, PostgreSQL, Redis, React/TypeScript/Tailwind, Docker, uv y pnpm con locks. No validar dominio con SQLite. No publicar credenciales.

Fuera de alcance: tienda/pagos E5, analítica E6 y paneles completos F3. Al terminar esta corrección, detenerse.
