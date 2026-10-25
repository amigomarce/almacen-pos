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
