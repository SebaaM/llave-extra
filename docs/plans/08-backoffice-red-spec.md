# Backoffice operativo de Prestador y Colaborador

Alcance aprobado por el usuario: dashboards con navegación lateral, identidad de Llave Extra y datos operativos propios. Correcciones confirmadas: cada usuario Prestador maneja un solo negocio; el Colaborador selecciona beneficios existentes del catálogo y su carpeta muestra **solo los beneficios elegidos**, nunca todas las ofertas del negocio. Este pedido adelanta la parte operativa de F3; tienda E5, analíticas E6 y dashboard analítico quedan pendientes. El Administrador sigue en Django Admin.

## Recomendaciones y compatibilidad

- `providers.FolderBenefit` será la selección canónica: FK protegidas a `CollaboratorProfile` y `Benefit`, fecha de creación, unicidad `(collaborator, benefit)`. La pertenencia se deriva del beneficio; no aceptar un proveedor o perfil arbitrarios del cliente.
- Un Colaborador activo y habilitado puede agregar y quitar selecciones de su propia carpeta. Agregar exige beneficio publicado/vigente de prestador publicado; repetir el agregado es idempotente. No puede editar la oferta, publicar, gestionar otro perfil, habilitarse, rotar QR, editar presentación ni asignar negocios a usuarios.
- El catálogo de selección es privado del Colaborador habilitado y usa la misma elegibilidad de publicación/vigencia del catálogo general. El interruptor del catálogo general afecta solo la superficie pública: no cierra este selector ni las recomendaciones privadas ya autorizadas.
- Migrar las asignaciones existentes de `FolderProvider` a selecciones de los beneficios publicados y vigentes **en el momento de migración**. Conservar las filas históricas de `FolderProvider`, disponibles solo para lectura administrativa; dejan de autorizar acceso. No crear selecciones automáticas cuando aparezcan nuevas ofertas. No eliminar ni reasignar datos históricos.
- Cliente por QR: continuar usando `active_folder_access` para cada consulta. Listas y red privadas solo incluyen prestadores con alguna selección vigente de esa carpeta; listas, detalle y medio de beneficio requieren la selección concreta. El medio del prestador también requiere una selección vigente. QR roto, rotado o colaborador deshabilitado revoca estos accesos.
- Consumo referido: conservar `locked_folder_access` dentro de la transacción y exigir al menos un beneficio seleccionado vigente del prestador. Agregar/quitar selecciones debe serializarse con la acreditación mediante los mismos bloqueos de perfil/prestador/beneficio. Quitar la última selección bloquea nuevos consumos referidos; no borra consumos, créditos ni grants históricos. Consumo directo conserva su elegibilidad general y una referencia inválida nunca degrada a directo.
- Si un beneficio seleccionado se retira o vence, conservar la selección pero devolverla como no disponible, sin divulgar su contenido borrador. El colaborador podrá quitarla. Una nueva publicación del mismo beneficio vuelve a estar sujeta a la vigencia actual.

## Un negocio por usuario Prestador

- `ProviderMembership` mantiene su FK/contrato y agrega unicidad de `user` en PostgreSQL; una cuenta puede tener cero o un negocio. La asignación permanece administrativa. No implicar unicidad de usuario por negocio: varios usuarios pueden estar vinculados al mismo negocio, cada uno a uno solo.
- Antes de crear la restricción, la migración detecta usuarios con más de un negocio y falla con explicación, sin escoger un negocio ni borrar membresías. Preflight local: cero usuarios con múltiples negocios.
- Frontend sin selector de negocios: usar el único negocio asignado. Cero negocios muestra estado vacío y contacto administrativo; una respuesta inconsistente con varios negocios falla cerrada.
- Edición de ficha/imagen y CRUD de beneficios respetan los campos permitidos actuales. Editar una oferta publicada la devuelve a borrador para revisión; no exponer un botón de publicación. Borrado de borradores seleccionados debe responder conflicto legible, nunca 500 ni eliminar selecciones ajenas en cascada.
- Las ofertas creadas desde un negocio demo heredan la marca demo del servidor; el cliente no puede cambiar esa marca. QR y PIN propios mantienen los permisos existentes; PIN de 6–12 dígitos solo escritura y nunca se devuelve ni persiste en el navegador.

## APIs del Colaborador

Todas requieren JWT de Colaborador activo, perfil propio habilitado y respuestas `no-store`.

- `GET /api/v1/collaborator/catalog/benefits/?page=1&search=&category=`: paginación `{count,next,previous,results}`, 24 por página y máximo 48. Cada resultado: `id,title,description,conditions,valid_from,valid_until,demo,provider:{id,name,category,demo}`. No relaciones de otros perfiles ni archivos borrador.
- `GET /api/v1/collaborator/recommendations/`: `{recommendations:[{benefit_id,available,benefit}]}`. `benefit` es nulo si no está disponible; cuando está disponible contiene los campos de lectura de beneficio existentes, su prestador y URLs de medios privados propios.
- `PUT /api/v1/collaborator/recommendations/<benefit_id>/` con objeto vacío: 201 al agregar, 200 al repetir. Campo extra 400, beneficio no elegible 404, perfil ajeno/no habilitado 403. El perfil se obtiene del servidor, no del cuerpo ni de la ruta.
- `DELETE` sobre esa ruta: 204 idempotente, siempre solo la selección propia.
- `GET /api/v1/collaborator/recommendations/<benefit_id>/media/`: imagen del beneficio seleccionado vigente; ajeno, no seleccionado, retirado o vencido devuelve 404. El medio del prestador usa la ruta existente del Colaborador, con la nueva pertenencia canónica.
- Mantener carpeta y QR JSON/PNG existentes. La respuesta de carpeta deduplica prestadores derivados de selecciones vigentes.

API adicional Prestador: `GET /api/v1/provider/providers/<provider_id>/consumption-credential/qr.png`, con el mismo permiso de propiedad que la credencial JSON, PNG generado en servidor con qrcode ya instalado, sin PIN ni dependencias/servicios externos. Sin credencial configurada 404. Cabeceras privadas y descarga segura.

## Dashboards

- Rutas `/prestador`, `/prestador/negocio`, `/prestador/beneficios`, `/prestador/qr`, `/prestador/cuenta`; `/colaborador`, `/colaborador/recomendaciones`, `/colaborador/catalogo`, `/colaborador/qr`, `/colaborador/cuenta`. `/espacio` redirige al panel correspondiente por rol; ADMIN a `/admin/`, Cliente a su experiencia actual.
- Barra lateral verde oscuro, contenido claro, acentos naranjas, logo y fuentes existentes. Encabezado con título y acceso al sitio. Menú móvil accesible, navegación activa, foco visible y objetivos táctiles de al menos 44 px. Sin overflow horizontal a 320 px.
- Prestador: resumen de estado, beneficios publicados/borradores y acciones; ficha editable con imagen; listado/alta/edición/borrado de borradores propios con fechas, condiciones y feedback de revisión; QR de consumo visible/descargable y formulario de PIN propio; cuenta y salida.
- Colaborador: resumen de habilitación y selecciones disponibles/no disponibles, listado de recomendaciones con quitar, selector paginado/buscable del catálogo con agregar y feedback sin duplicados, QR actual visible/descargable/copiar enlace, cuenta y salida. Deshabilitado: estado claro y ningún QR o recomendación anteriores visibles.
- Los contadores son operativos, derivados de las respuestas propias; no inventar actividad, conversiones, clientes ni gráficos. No llamar APIs de billetera/consumos del Cliente desde estos roles.
- Integrar en el login, restauración y navegación existentes sin redirección global que impida visitar portada/catálogo. Rutas ajenas no disparan APIs del otro rol. Mantener Admin y sus assets servidos por Django.

## Seguridad y validación

API sigue siendo autoridad de rol, habilitación, propiedad, selección y vigencia. Preservar JWT en memoria, refresh HttpOnly/CSRF, Web Locks y aislamiento por versión de sesión; limpiar inmediatamente datos, archivos Blob y QR al salir o cambiar cuenta. Cancelar o ignorar respuestas tardías de listas, imágenes, subidas y escrituras. FormData usa el mismo cliente autorizado, sin fijar Content-Type multipart manualmente ni degradar sus reintentos.

No persistir PIN, JWT ni QR en storage, query strings, logs, informes o screenshots de tests. No QR externo, no HTML/SVG inyectado. Las cuentas de prueba se documentan solo en archivo local ignorado. QA con datos sintéticos; no cambiar ofertas históricas publicadas para probar ediciones.

Verificar PostgreSQL/Redis, migraciones, Ruff y OpenAPI; frontend pruebas/lint/tipos/build con pnpm. QA real en escritorio/móvil de ambos roles y denegación de rutas ajenas. GitFlow, commits españoles y PR propio contra develop, sin merges ni force push. La rama parte de la base revisada `95b9953`, dependiente del PR #9 aún abierto; preservar esa dependencia y explicarla en el nuevo PR.
