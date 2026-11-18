# Auditoría CI: excepción temporal de picomatch

**La biblioteca sigue vulnerable.** Este corte propone una aceptación temporal de riesgo de tooling para revisión en el PR #30; no declara corregida ni mitigada la vulnerabilidad y no autoriza fusionar el PR.

## Diagnóstico

- El [PR #17](https://github.com/SebaaM/llave-extra/pull/17) resolvió GHSA-g3hv-75wg-m249 de minimatch y ya es ancestro del corte local. Las ramas recientes conservan ese override, no un arreglo de picomatch.
- En el [CI del corte 9aff03a](https://github.com/SebaaM/llave-extra/actions/runs/44203411238), backend, instalación, lint, tipos, 437 pruebas UI y build aprobaron; falló la auditoría.
- El informe real de pnpm devuelve código 1: una alerta high de picomatch 4.0.7 y 37 rutas de Vite, Vitest y TypeScript ESLint. Es [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), no el aviso anterior de minimatch.
- El registro consultado publica 4.0.7 como latest y responde 404 a 4.0.8, aunque el informe señala >=4.0.8 como parche. GitHub todavía indica que no hay versión corregida. No se inventó una versión ni se cambió el lockfile.

## Política propuesta

CI ejecuta `pnpm audit --audit-level moderate --json`, conserva su código y evalúa el informe con `frontend/scripts/check-audit-report.mjs`. No hay exclusión en pnpm-workspace.yaml, ignoreGhsas, ignore-unfixable ni continue-on-error global.

Se permite **solo** el aviso exacto, con severidad high, versión 4.0.7 y rangos previstos, siempre que todas sus rutas pertenezcan a los prefijos de tooling enumerados. Una dependencia de aplicación, cadena malformada, alerta adicional moderate/high/critical, esquema desconocido, contadores incoherentes, error de registro o código inesperado bloquea.

**Vence el 25/11/2026 a las 00:00 UTC.** Desde ese instante la misma alerta bloquea de nuevo. Mientras esté vigente, el log imprime HIGH y UNPATCHED y genera una advertencia visible de GitHub Actions. La imagen de producción sirve archivos estáticos desde Nginx; esta aceptación no habilita procesar globs no confiables ni nuevos usos de picomatch.

## Comprobaciones

- RED del evaluador inexistente; después se observaron RED específicos para la ruta de TypeScript ESLint y el umbral de JSON, antes de sus correcciones.
- Revisión independiente detectó cadenas de dependencias malformadas y claves de severidad desconocidas. Tres regresiones adicionales fallaron antes del arreglo y pasaron después; el reexamen independiente confirmó ambas correcciones.
- `node --test tests/audit-policy.test.mjs`: 24 pruebas aprobadas, incluidos vencimiento, aplicación importando tooling, nueva alerta, errores, esquema y CLI.
- El mismo informe real rechazado por pnpm con código 1 fue aceptado por la política con código 0 **y advertencia explícita de una vulnerabilidad high sin parche**. No se transformó el informe en «cero vulnerabilidades».
- ESLint incluye los dos módulos Node nuevos y aprobó. Tipos, una prueba de proxy, build y las 437 pruebas UI en 40 archivos aprobaron. Las comprobaciones de política finales (24) se volvieron a ejecutar después de la corrección del revisor. Los jobs remotos deben confirmarse en la CI del PR antes de declarar su cierre.
- El lockfile y pnpm-workspace.yaml no cambian. No hay cambios de backend, API, datos, permisos de producto ni frontend servido; no se repitió la suite PostgreSQL local.

## Retirada

Cuando exista un parche publicado, verificar su origen, actualizar la resolución transitiva y ejecutar instalación congelada, lint, tipos, pruebas, build y auditoría. Retirar la excepción —o el evaluador si ya no aporta otra política— y sus instrucciones correspondientes. Si no existe una solución al vencer, mantener CI bloqueada y pedir una nueva decisión explícita; no ampliar el plazo automáticamente. El estado remoto vigente se consulta en el PR.
