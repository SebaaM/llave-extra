# GitFlow obligatorio

- `main`: versiones estables. No desarrollar directamente.
- `develop`: integración de entregas revisadas.
- `feature/<objetivo>`: nace de develop; PR hacia develop.
- `release/<version>`: preparación de una entrega desde develop; PR hacia main y reintegración en develop tras aprobación.
- `hotfix/<objetivo>`: corrección urgente desde main; PR hacia main y reintegración en develop.
- Conventional Commits con descripción en español. Verificar antes de cada commit; sin force push, merges automáticos ni secretos.

Bootstrap del 19/10/2026: se crea develop en `415f235f31a0974f0a8016b8617dee311b51fb82`, base E4+F2 revisada, y `feature/catalogo-publico-admin` para la corrección. Los PRs históricos #7 y #8 y sus ramas se conservan para revisión; no se fusionan ni se reescribe su historia. Antes de publicar una versión estable, revisar explícitamente esas entregas incluidas en develop. Crear develop no declara que main haya incorporado esas funcionalidades.

El CI se ejecuta en todos los `push` y `pull_request` sin filtros de rama; por eso cubre `develop`, `feature/*`, `release/*` y `hotfix/*`. Abrir el PR de esta corrección contra `develop` y comprobar allí el resultado remoto antes de pedir revisión.

Ejemplo de nueva funcionalidad:

```sh
git switch develop
git pull --ff-only origin develop
git switch -c feature/nombre-de-la-funcionalidad
# implementar, verificar y commitear
git push -u origin feature/nombre-de-la-funcionalidad
# abrir PR con base develop; no fusionarlo automáticamente
```
