# ADR-003: Cálculo de neto e IVA desde precios con IVA incluido

- Fecha: 2026-10-25
- Estado: Aprobado (2026-10-25, por el usuario, como parte del plan de Fase 1)

## Contexto

En el almacén los precios se muestran y cobran **con IVA incluido** (CLAUDE.md §3). La boleta
electrónica exige informar `MntNeto`, `IVA`, `MntExe` y `MntTotal` en pesos enteros, y el
total no puede cambiar respecto de lo cobrado. Hay que definir dónde y cómo se redondea.

Tasa: 19 % (DL 825, art. 14). Confirmado como vigente al 2026-10-25 con fuentes secundarias
([Buk](https://www.buk.cl/novedades/finanzas/valor-iva-chile),
[Monedario](https://monedario.cl/calculadoras/iva/)); no se encontró cambio legal. Queda como
constante `TASA_IVA_PORCENTAJE` y parámetro de las funciones, para cambiarla en un solo lugar.

## Opciones consideradas

1. **Desglose por línea** y suma: cada línea redondea por su cuenta y los errores de $1 se
   acumulan; neto + IVA puede no cuadrar con lo esperado del total.
2. **Desglose sobre el total afecto del documento**, una sola vez.
3. Calcular desde precios netos (como una factura): obligaría a guardar precios sin IVA,
   y el total con IVA podría diferir en $1 del precio publicado en la góndola.

## Decisión

Opción 2. En `packages/core/src/iva.ts`:

```
afecto = Σ líneas afectas (con IVA, ya con descuentos)
neto   = round(afecto × 100 / (100 + tasa))   -- half-up, aritmética entera
iva    = afecto − neto
exento = Σ líneas exentas
total  = afecto + exento                      -- = lo que paga el cliente (antes del redondeo de efectivo)
```

- Sin floats: `dividirRedondeado` hace la división entera con redondeo half-up.
- `neto + iva = afecto` siempre, por construcción. El IVA difiere a lo más en $1 de
  `round(neto × 0,19)` (verificado por test para todos los montos de $0 a $50.000).
- Redondeo de efectivo (Ley 20.956) **no** entra aquí: se aplica después sobre lo cobrado y
  no modifica el documento (ADR-001 §5).
- Líneas: `round(cantidad_milli × precio / 1000)` half-up (ADR-002).

## Consecuencias

- `TODO(SII)`: en Fase 5, validar con el set de pruebas del SII que su validador acepta esta
  fórmula para boletas con `IndMntNeto` omitido (montos brutos). Si exige otra, se cambia
  solo `desglosarIva`.
- Los reportes por línea (margen, categoría) usan montos con IVA; el neto por línea, si se
  necesita, es aproximado y no debe sumarse para el documento.
