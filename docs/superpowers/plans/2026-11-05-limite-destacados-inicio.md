# Selección de beneficios destacados del inicio

El administrador necesita ver todos los beneficios en una sección de gestión y elegir hasta cinco para el carrusel. Cada selección se guarda al pulsar «Destacar» o «Quitar». Se conserva el orden público vigente y la publicación sigue sujeta a la política del catálogo.

- [x] Proteger el máximo de cinco en PostgreSQL mediante cupos internos únicos. Conservar las primeras cinco marcas existentes en el orden habitual del carrusel si hay excedentes. El seed de actividad deja las nuevas ofertas sin destacar.
- [x] Reutilizar el PATCH versionado y auditado de beneficios. Agregar el filtro administrativo `featured` para consultar la selección completa y devolver un conflicto legible cuando se agoten los cupos.
- [x] Incorporar `/gestion/beneficios-destacados` con búsqueda, paginación, selección actual, contador y acciones por beneficio. Mantener visible el estado de publicación de cada oferta.
- [x] Verificar el límite, la liberación de cupos, las escrituras concurrentes, la migración, el contrato y la interfaz con PostgreSQL y las pruebas focales de React.

## Verificación

- En Docker, `python -m pytest --ds=config.settings.test -q providers/tests/test_featured.py providers/tests/test_featured_migration.py` pasó 23 pruebas en la primera corrida. La repetición del archivo de migraciones pasó los 2 escenarios, incluido el recorte de marcas existentes.
- En Docker, `ruff check .`, `python manage.py makemigrations --check --dry-run` y `python manage.py spectacular --validate --file /tmp/llave-extra-featured-openapi.yaml` pasaron. Se usó `config.settings.test` para las comprobaciones de Django.
- `pnpm run lint`, `pnpm run typecheck` y `pnpm run build` pasaron. La repetición con `pnpm exec vitest run --maxWorkers=1 --testTimeout=20000` aprobó las 11 pruebas de `AdminWorkspace.test.tsx` y las 6 de `HomeFeatured.test.tsx`. La corrida amplia inicial mostró tiempos de espera en Docker. El caso de QR que todavía falló en la repetición pasó al ejecutarlo aislado.
- En la base local de desarrollo, `migrate providers 0008_limit_featured_benefits` conservó los 74 beneficios y cinco de las seis marcas demo existentes. La ruta del panel respondió HTTP 200 y el endpoint público devolvió cinco destacados.

## Revalidación del 06/11/2026 sobre develop

- Base `ae0c2bf`, posterior al merge de la auditoría de seguridad. En Docker y con PostgreSQL y Redis aislados, `python -m pytest -q providers/tests/test_featured.py providers/tests/test_featured_migration.py shop/tests/test_catalog_admin.py config/tests/test_private_query_inputs.py` aprobó 46 pruebas. Aprobaron además `ruff check .`, `python manage.py makemigrations --check --dry-run` y `python manage.py spectacular --file /tmp/openapi.yaml --validate --fail-on-warn`.
- En Docker aprobaron `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:proxy`, `pnpm exec vitest run src/product/admin src/product/HomeFeatured.test.tsx --maxWorkers=2 --testTimeout=20000 --reporter=dot` con 57 pruebas, y `pnpm run build`.
