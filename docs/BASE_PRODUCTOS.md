# Base semilla de productos chilenos

Objetivo: que al escanear un producto común en Chile, el sistema ya conozca su nombre,
marca, formato y categoría. El dueño solo pone **precio** y **stock**.

## 1. Fuentes (en orden de prioridad)

| Fuente | Qué aporta | Licencia / notas |
|---|---|---|
| **Open Food Facts** (`cl.openfoodfacts.org`) | Alimentos y bebidas con EAN, marca, cantidad, categorías, imagen. Exporta CSV/JSONL diarios y API JSON. | ODbL: citar fuente y compartir mejoras de la base bajo la misma licencia. Filtrar `countries_tags` contiene `en:chile`. |
| **Open Products Facts / Open Beauty Facts** | Aseo, limpieza, cosmética, mascotas. | ODbL, mismas reglas. |
| **Lista curada propia** (`data/curado/*.csv`) | Productos de almacén que faltan en OFF: marcas chilenas de abarrotes, aseo, cigarros, pan envasado, etc. | Creada por nosotros. |
| **Productos aprendidos** | Cada local que crea un producto nuevo puede (opt-in) aportarlo a la base central. | Revisar calidad antes de publicar. |
| Catálogos públicos de supermercados chilenos | **NO hacer scraping** sin revisar términos de uso. Solo si hay autorización o API pública. | Riesgo legal; decidir en ADR. |

Antes de implementar el ETL: verificar el tamaño real de la cobertura chilena de OFF
(descargar el export y contar productos con `en:chile`). Documentar el número en este archivo.

### 1.1 Cobertura medida (2026-10-25)

Medido con `pnpm --filter @almacen/data medir` (deja todo en `data/raw/`, fuera de git).

**Qué descargar.** Se usa el export CSV (TSV gzip) de cada fuente, leído en streaming:

| Export | Tamaño | Uso |
|---|---|---|
| OFF CSV `en.openfoodfacts.org.products.csv.gz` | 1.492 MB gz (~9 GB descomprimido) | **Elegido** |
| OFF Parquet (Hugging Face `food.parquet`) | 7.986 MB | Descartado: 5× más pesado |
| OFF JSONL `openfoodfacts-products.jsonl.gz` | 13.238 MB | Descartado |
| Open Beauty Facts CSV | 18 MB | Elegido |
| Open Products Facts CSV | 6 MB | Elegido |
| Open Pet Food Facts CSV | 3 MB | Elegido (categoría Mascotas) |

La API de búsqueda por país no sirve para la descarga masiva (10 req/min, y OFF pide usar los
exports). Leer el CSV de OFF completo toma ~1 minuto. Después, el subconjunto chileno queda en
`data/raw/<fuente>.chile.tsv`.

**Productos con `en:chile`** (export OFF del 25-oct-2026; los otros del 21-oct-2026):

| Fuente | Filas totales | Chile | EAN válido¹ | Prefijo 780 | Nombre | Marca | Cantidad | Categoría | Imagen | Completos² |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Open Food Facts | 4.833.779 | **6.869** | 6.631 (96,5 %) | 4.794 | 90,7 % | 79,7 % | 40,0 % | 42,0 % | 66,0 % | 2.164 (31,5 %) |
| Open Beauty Facts | 64.237 | 169 | 163 | 41 | 69,2 % | 51,5 % | 40,2 % | 47,9 % | 81,7 % | 44 |
| Open Products Facts | 41.133 | 46 | 43 | 11 | 63,0 % | 58,7 % | 52,2 % | 69,6 % | 89,1 % | 18 |
| Open Pet Food Facts | 15.145 | 15 | 14 | 3 | 53,3 % | 46,7 % | 46,7 % | 40,0 % | 93,3 % | 4 |

¹ EAN-13/EAN-8/UPC-A con dígito verificador correcto, sin códigos de balanza (20–29) y sin
duplicados. Descartes en OFF: 158 de balanza, 77 con dígito malo, 3 con formato malo.
² EAN válido + nombre + marca + cantidad + categoría.

- **Total estimado de la semilla: ~6.850 EAN únicos.** Solo 1 código se repite entre fuentes,
  así que casi no hay que deduplicar. Unos 2.230 vienen completos.
- **Lo más débil es la cantidad/formato (40 %) y la categoría (42 %).** El normalizador puede
  sacar el formato del nombre ("Leche 1 L"), y el mapeo de categorías tiene que funcionar con
  pocas etiquetas. Sin categoría → "Otros".
- **Candidatos extra:** OFF tiene 9.714 productos con prefijo GS1 Chile (`780…`), y 4.960 de
  ellos **no** tienen la etiqueta `en:chile` (2.689 dicen Brasil, 720 España, 658 EE.UU.:
  probablemente exportaciones como vino, fruta o conservas). Podrían entrar con
  `quality_score` más bajo. Por decidir.
- **Calidad de la muestra** (20 al azar de OFF, semilla fija): 6 traen nombre, marca y formato
  ("Quillayes Quesillo Sano y Natural 150g", "Colun Mi Quesillo Fresco y Natural 320g"),
  8 traen nombre y marca pero no formato ("Lays Jamón Serrano", "Quaker Granola multisemillas"),
  2 traen nombre sin marca y 4 no traen nombre (solo imagen o código). Hay errores comunes: marca mal escrita ("Colun" por "Colún"), mayúsculas ("ZUCOSOS"),
  categorías en otro idioma ("en:quesos"), unidades sueltas ("1 kilo", "428.0 g").

## 2. Esquema de la base semilla

```
seed_products(barcode PK, name, brand, quantity_text, unit, net_qty, category_slug,
              image_url, source, source_id, quality_score, updated_at)
seed_categories(slug, name_es, parent_slug)
```

- Nombre normalizado estilo góndola: `Marca + Producto + Formato` → "Colún Leche Entera 1 L".
- `quality_score` 0–100 (tiene marca, nombre, formato, categoría, imagen).
- Validar dígito verificador EAN-13/EAN-8/UPC-A; descartar inválidos.
- Ignorar códigos internos (prefijos 20–29) en la semilla.

## 3. Taxonomía de categorías de almacén (en español)

Abarrotes (arroz, fideos, legumbres, aceite, harina, azúcar, sal, conservas, salsas, condimentos),
Desayuno (café, té, cereales, mermeladas, galletas), Lácteos y huevos, Fiambrería y quesos,
Panadería, Frutas y verduras, Congelados, Bebidas (gaseosas, jugos, aguas, energéticas),
Alcoholes (cerveza, vino, destilados), Snacks y confites, Aseo personal, Limpieza del hogar,
Bebé, Mascotas, Cigarros, Librería y bazar, Otros.

Mapear `categories_tags` de OFF a esta taxonomía con una tabla de equivalencias en
`data/mapeo_categorias.csv` (editable a mano).

## 4. Pipeline (`pnpm data:build`)

1. Descargar export OFF (CSV) → filtrar Chile → normalizar.
2. Unir con OPF/OBF y con `data/curado/`.
3. Deduplicar por barcode (prioridad: curado > OFF > otros).
4. Mapear categorías, calcular `quality_score`.
5. Generar `seed.sqlite` (para el instalador de la caja) y un JSON por lotes para la nube.
6. Reporte: total, % con marca, % con categoría, top categorías.

La caja trae `seed.sqlite` incluido y consulta **localmente** (offline). Si no encuentra el
código, consulta la API de OFF en línea (si hay internet) y, si tampoco, crea producto nuevo.

## 5. Atribución

Incluir en "Acerca de" de la app: datos de productos de Open Food Facts y proyectos
asociados bajo ODbL.
