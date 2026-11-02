# Corrección de CI de develop — 02/11/2026

Base: `origin/develop` `825020561aeb392cbeec80eeb2da0f4039326e9f`, merge externo del PR #16. Rama: `feature/corregir-ci-develop`, worktree aislado para conservar el checkout original con cambios sin commit y el worktree que ya tiene develop abierto.

## Diagnóstico reproducido

- [CI del merge](https://github.com/SebaaM/llave-extra/actions/runs/41225690846): backend aprobado; frontend aprueba instalación bloqueada, lint, tipos, 309 pruebas UI + 1 proxy y build. Falla únicamente `pnpm audit --audit-level moderate`.
- [CI del push anterior](https://github.com/SebaaM/llave-extra/actions/runs/41214903585): mismo fallo de auditoría, anterior al merge.
- `pnpm audit --audit-level moderate` sobre el lockfile original reproduce exit 1: una vulnerabilidad moderada de minimatch 10.2.6, 37 rutas transitivas de ESLint/typescript-eslint. La primera ejecución restringida no pudo acceder a npm; la reproducción con acceso a red sí devolvió el aviso completo.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), publicado en GitHub Advisory Database el 30/10: versiones afectadas `<11.0.1`, corregida `11.0.1`. La falla aparece al auditar el árbol existente contra el aviso actualizado.

## Corrección

`frontend/pnpm-workspace.yaml` fija temporalmente `minimatch@<11.0.1` a `11.0.1`. `pnpm install --lockfile-only` regenera el lockfile con sus integridades y su dependencia `@isaacs/nonrecursive-glob-match`. No se modifican las versiones directas de package.json ni se excluyen avisos de seguridad.

Los metadatos de npm consultados el 02/11 muestran que incluso ESLint 10.14.0, @eslint/config-array 0.23.5 y @typescript-eslint/typescript-estree 8.72.1 siguen pidiendo minimatch 10. El override se retirará cuando sus rangos admitan una versión corregida, con instalación bloqueada, lint y auditoría completos. Node 24.19.0 satisface el requisito de la versión corregida; su API incluye exports ESM y CommonJS. La compatibilidad con los consumidores se comprueba ejecutando el lint y los tipos reales del proyecto.

La primera ejecución completa en Linux expuso además una carrera en `Workspace.test.tsx`: la prueba de `/espacio` espera que `window.location.pathname` sea `/gestion` y consulta inmediatamente el panel con `getByRole`, aunque `replaceState` sucede antes de que React procese `popstate` y termine el render. Se reprodujo exit 1 con la URL correcta y el DOM anterior. Las dos pruebas Admin (restauración y login) ahora esperan el panel mediante `findByRole`, conservando también el assert de URL, sin sleeps, reintentos globales ni cambios al producto.

## Verificación del cambio

Entorno nativo aislado: Node 24.19.0, pnpm 11.22.0; instalación propia dentro del worktree, sin reutilizar node_modules de otro checkout.

- `pnpm install --frozen-lockfile`: exit 0, instalación de 242 paquetes.
- `pnpm audit --audit-level moderate`: exit 0, sin vulnerabilidades conocidas.
- `pnpm run lint` y `pnpm run typecheck`: exit 0 nativos.
- `pnpm run build`: exit 0 nativo al repetir con permisos de lectura del host; el primer intento restringido falló porque esbuild no podía leer directorios superiores, sin error de código.
- Primera suite nativa: 308/309 UI + 1 proxy aprobados; una prueba de ProductApp agotó el timeout de 5 s. Se repite la suite completa con los mismos límites en Linux para separar compatibilidad de dependencias y coste de E/S del entorno Windows/OneDrive.
- `docker build -t llaveextra-ci-frontend:20261102 ./frontend`: exit 0; imagen Node 24.19.0 Alpine, pnpm 11.22.0, instalación bloqueada limpia sin montar node_modules del host.
- Primera suite Linux: 308/309 UI + 1 proxy aprobados; el caso QR pasó (2,384 s), pero el assert inmediato del panel Admin falló como se describe arriba. Se corrige la espera y se ejecutan de nuevo todos los controles.
- Controles completos en la imagen Linux, segunda ejecución: exit 0. Comando: `docker run --rm --name llaveextra-ci-frontend-20261102 llaveextra-ci-frontend:20261102 sh -c 'pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm audit --audit-level moderate'`.
  - Lint y tipos aprobados.
  - 309/309 pruebas UI en 26 archivos y 1/1 proxy aprobados, sin aumentar límites ni reintentos. Las dos pruebas Admin pasan; el caso QR termina en 1,987 s.
  - Build aprobado, 95 módulos; la auditoría informa `No known vulnerabilities found`.
  - Persisten mensajes conocidos de jsdom sobre navegación a otro documento; no son fallos de la suite.
- `git diff --check`: exit 0. Diff revisado: override/lockfile, dos esperas de pruebas y documentación. Sin cambios en aplicación, workflow, contrato OpenAPI o backend.

Backend, OpenAPI y migraciones sin cambios; la aprobación backend citada arriba pertenece al CI del merge y no se presenta como una nueva ejecución local. No se ejecutan integraciones de pagos ni se modifica la base local.

Entrega mediante PR hacia develop, sin merge automático. El resultado remoto de la corrección se consulta en sus comprobaciones.
