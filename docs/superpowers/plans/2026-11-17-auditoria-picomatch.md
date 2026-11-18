# Auditoría acotada de picomatch — plan de implementación

> **Para ejecución:** usar Superpowers, RED → GREEN y revisión independiente. Una única unidad de política, pruebas y documentación; no fusionar el PR.

**Objetivo:** atender «sino corregilo. o actualizar la auditoria» sin inventar una versión corregida ni desactivar la auditoría.

**Arquitectura:** pnpm conserva la auditoría de nivel moderate y produce JSON con su código de salida. Un evaluador sin dependencias falla cerrado salvo por una excepción explícita, visible y temporal para GHSA-fc5q-39xc-vjpf. Esto acepta riesgo de tooling sin corregir la biblioteca; no equivale a una auditoría sin vulnerabilidades.

**Stack:** Node 24.19.0, pnpm 11.22.0 y node:test. Sin cambios de dependencias ni lockfile.

## Política y límites

- Solo GHSA-fc5q-39xc-vjpf, paquete picomatch 4.0.7, severidad high y rango <=4.0.7; todas las rutas afectadas deben partir de un tooling permitido y atravesar Vite, Vitest o TypeScript ESLint.
- Vencimiento elegido para esta excepción: 2026-11-25T00:00:00Z. Después de ese instante la misma alerta vuelve a bloquear. No ampliar automáticamente.
- Alertas nuevas moderate/high/critical, otra versión, rutas de aplicación, JSON inválido, errores de registro, esquema incoherente o código de auditoría inesperado bloquean.
- La excepción se anuncia como advertencia. No usar ignoreGhsas, --ignore-unfixable, continue-on-error global ni bajar el umbral.
- Solo se modifica la política CI de este PR; no se declara mitigada la vulnerabilidad ni se habilitan merges.

## Unidad de implementación

**Archivos:** crear frontend/scripts/check-audit-report.mjs y frontend/tests/audit-policy.test.mjs; modificar frontend/package.json y .github/workflows/ci.yml. Actualizar CONTEXT.md, ToDo.md, AGENTS.md y la verificación de CI.

- [x] Escribir y observar RED de los casos de aceptación y rechazo.
- [x] Implementar el evaluador y observar GREEN.
- [x] Conectar las pruebas a pnpm test y evaluar el resultado real de pnpm audit en CI, conservando la auditoría activa.
- [x] Reproducir el rechazo base y la excepción visible sobre el mismo informe real, sin cambiar node_modules compartidos.
- [x] Ejecutar lint, tipos, pruebas, build y revisión independiente del diff.
- [x] Publicar un commit separado en el PR #30 y comprobar push/pull_request sin fusionar. La primera PR aprobó; el push expuso una carrera previa del fixture de cuenta, documentada y corregida sin cambiar autenticación. El corte final se confirma en la CI vigente del PR.

## Foco de revisión

La expiración es absoluta; una alerta adicional no queda absorbida por la excepción; los errores de transporte no pasan como cero vulnerabilidades; una ruta de aplicación no recibe el permiso de tooling; el paquete y la versión deben coincidir exactamente. Cada condición debe tener una prueba.

## Evidencia previa

El PR #17 resolvió GHSA-g3hv-75wg-m249 de minimatch y ya es ancestro de este corte. No hay un commit de picomatch en la búsqueda del repositorio y las ramas recientes conservan solo el override de minimatch. La auditoría base devuelve código 1, una alerta high y 37 rutas de picomatch 4.0.7. npm publica 4.0.7 como latest y responde 404 a 4.0.8; la ficha de GitHub aún indica que no hay parche publicado.
