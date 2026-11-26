# Filtro público de beneficios por prestador

`/beneficios?provider=<uuid>` muestra el catálogo público de un comercio. La ficha conserva el filtro al buscar, elegir una categoría y paginar; el usuario puede quitarlo sin abandonar el catálogo.

`GET /api/v1/catalog/benefits/` admite el parámetro opcional `provider` documentado en OpenAPI. Se aplica sobre los beneficios publicados y vigentes, sin resolver carpetas privadas. Un comercio no publicado o un UUID desconocido no devuelve beneficios. Un parámetro inválido o duplicado devuelve 400.

Comprobaciones en esta rama: 36 pruebas sobre una base PostgreSQL nueva, 39 pruebas del frontend, lint y compilación. La primera corrida con una base reutilizada no tenía la fila inicial del catálogo; se repitió con las migraciones en una base de pruebas nueva.
