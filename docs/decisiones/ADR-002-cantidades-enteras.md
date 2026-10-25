# ADR-002: Cantidades como enteros en milésimas

- Fecha: 2026-10-25
- Estado: Aprobado (2026-10-25, por el usuario)

## Contexto

`docs/ARQUITECTURA.md` §3 pedía cantidades `NUMERIC(12,3)` para vender por kg. SQLite no
tiene un tipo decimal exacto: `NUMERIC` termina guardado como `REAL` (float) o `INTEGER`
según el valor, y en JavaScript `0.1 + 0.2 !== 0.3`. Una suma de stock con float acumula
errores, y el subtotal de una venta por peso (`kg × precio`) puede quedar mal en $1.

## Opciones consideradas

1. `REAL` / `number` con decimales: simple, pero inexacto. Descartado (mismo motivo que
   nunca usar float para dinero).
2. `TEXT` con una librería decimal (decimal.js): exacto, pero agrega una dependencia en
   `core` y conversiones en cada consulta.
3. `INTEGER` en milésimas: exacto, rápido, sumable en SQL, sin dependencias.

## Decisión

Opción 3. Toda cantidad se guarda y se calcula como **entero en milésimas** de la unidad
del producto, con sufijo `_milli`:

- Producto por unidad (`UN`): 1 unidad = `1000`, 3 unidades = `3000`.
- Producto por peso (`KG`): 1 g = `1`, 1,250 kg = `1250`.

El total de una línea es `round(qty_milli × unit_price_clp / 1000)` con redondeo
half-up a peso entero (en `packages/core`, aritmética entera).

## Consecuencias

- La UI convierte al mostrar ("1,250 kg", "3") y al leer lo que escribe el cajero.
- Precisión máxima: 1 gramo. Suficiente para balanzas de almacén.
- Límite: `Number.MAX_SAFE_INTEGER` da de sobra (≈ 9 billones de kg).
- Los códigos de balanza con peso en gramos se traducen directo a `qty_milli`.
