# Imágenes y cartografía de Llave Extra

Las fotografías de ciudad se guardan sin editar en `frontend/public/images/`. El CSS solo recorta su presentación. La página `/creditos-imagenes` enlaza estos créditos desde el pie de la aplicación.

| Archivo | Dimensiones | Autor y fuente | Licencia |
| --- | --- | --- | --- |
| `ushuaia-harbor.jpg` | 1920 × 1280 | Liam Quinn, [Ushuaia viewed from the Beagle Channel](https://commons.wikimedia.org/wiki/File:Ushuaia_viewed_from_the_Beagle_Channel_(5525266354).jpg) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `ushuaia-beagle.jpg` | 1920 × 1280 | Liam Quinn, [Beagle Channel](https://commons.wikimedia.org/wiki/File:Beagle_Channel_(6319596937).jpg) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |

El mapa embebido muestra Ushuaia, sin marcadores de comercios. Datos y cartografía © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Los nodos del tablero representan la red visual, no coordenadas reales.

Los medios comerciales de demostración se versionan en `backend/providers/fixtures/images/` y `seed_demo_media` los instala en storage privado solo si el registro demo conserva su campo vacío. Los sirve la API pública o privada según el permiso vigente; los fixtures no tienen ruta web. Son marcas y fotografías de sus titulares, **sin licencia Creative Commons atribuida**. Revisar permisos y materiales definitivos antes de producción.

| Archivo | Registro y uso | Fuente |
| --- | --- | --- |
| `kuar-logo.png` | KUA001, logo del prestador | [Kuar](https://kuar.com.ar/bar/wp-content/uploads/2016/07/kuar-1.png) |
| `kuar-interior.jpg` | KUA001, foto del beneficio, 2384 × 1625 | [Kuar](https://kuar.com.ar/bar/wp-content/uploads/2015/06/kuar_vista_mesa.jpg) |
| `antarctica-logo.png` | ANT007, logo del prestador | [Antarctica Hostel](https://antarcticahostel.com/wp-content/uploads/2022/09/antarctica-logo-v2-1024x598.png) |
| `antarctica-common.jpg` | ANT007, foto del beneficio, 1280 × 720 | [Antarctica Hostel](https://antarcticahostel.com/wp-content/uploads/2022/09/Galeria-Fotos-1-2.jpg) |
| `cumbre-logo.png` | CUM001, logo del prestador, 920 × 352 | [Llave Extra](https://www.llaveextra.com/cumbre-rental/imagenes/logo-cumbre%20original.png) |
| `tamara-vasak-logo.webp` | CHO001, logo del prestador, 416 × 416 | [Llave Extra](https://www.llaveextra.com/chocolaterias/imagenes/tamaravasak1.webp) |
| `cafe-laguna-logo.webp` | CAF001, logo del prestador, 800 × 600 | [Llave Extra](https://www.llaveextra.com/cafeterias/imagenes/logo-cafe-laguna.webp) |
| `ksar-navegacion.webp` | KSAR001, foto del beneficio, 600 × 800 | [Llave Extra](https://www.llaveextra.com/excursiones/imagenes/veleroksar.webp) |

Los beneficios históricos cargados desde fuentes públicas se identifican como `demo` en la API y la interfaz. La carga de imágenes no altera condiciones, vigencia, publicación, QR, PIN ni créditos.

## Tienda visual — 26/10/2026

`frontend/src/product/shop/ProductArt.tsx` contiene ilustraciones SVG originales creadas para los ejemplos: pingüino, faro, montañas, maceta, llavero y soporte. Variantes de color en `examples.ts`; sin descargas ni recursos de terceros. La interfaz indica que son ilustraciones y productos de ejemplo, no fotografías o productos comerciales confirmados. Se conservan logo, fuentes y colores del sitio.
