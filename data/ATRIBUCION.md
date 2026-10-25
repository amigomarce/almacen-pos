# Base semilla de productos — licencia y atribución

`seed.sqlite` es una base de datos derivada de:

- **Open Food Facts** — https://openfoodfacts.org
- **Open Pet Food Facts** — https://openpetfoodfacts.org
- **Open Beauty Facts** — https://openbeautyfacts.org
- **Open Products Facts** — https://openproductsfacts.org

más una lista curada propia (`data/curado/`).

Se distribuye bajo la **Open Database License (ODbL) v1.0**:
https://opendatacommons.org/licenses/odbl/1-0/

El contenido de cada ficha está bajo la **Database Contents License (DbCL) v1.0**:
https://opendatacommons.org/licenses/dbcl/1-0/

Las imágenes de los productos no se incluyen; `image_url` apunta a los servidores de Open
Food Facts, donde las fotos tienen licencia CC BY-SA.

## Cómo reconstruirla

El método completo está en la carpeta `data/` del código fuente (ODbL §4.6):

```bash
pnpm install
pnpm data:build
```

Descarga los exports públicos, filtra productos de Chile (etiqueta `en:chile` o código GS1
Chile `780`), normaliza nombres, deduplica, categoriza y escribe `data/out/seed.sqlite`.
Las fechas de cada export usado están en la tabla `seed_meta` (`sources`).
