# ADR-006: Venta por monto y etiquetas de balanza con precio

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25, por el usuario)

## Contexto

En el almacén se vende por peso de dos formas que no calzan con "peso × precio":

1. **Por monto**: el cliente pide "$1.000 de pan". El cajero no pesa: entrega más o menos ese
   valor y cobra **exactamente $1.000**.
2. **Etiqueta de balanza con precio** (EAN-13 con prefijo 2x y el precio embebido): la balanza
   ya calculó e imprimió el precio; la caja debe cobrar **ese** monto.

Con cantidades en milésimas (ADR-002), el subtotal de una línea es
`round(cantidadMilli × precio / 1000)`. Al convertir un monto a gramos y volver a pesos se
pierde exactitud: $1.000 de pan a $1.990/kg son 502,51 g → 503 g → **$1.001**. Con quesos o
fiambres (> $1 por gramo) hay montos que **ningún** peso entero en gramos produce.

## Opciones consideradas

1. **Buscar el peso que dé el monto** (o el más cercano por debajo): a veces cobra $1 menos de
   lo pedido, y la etiqueta de balanza no se respetaría.
2. **Vender como "1 unidad" a ese precio**: el monto es exacto, pero el stock (que es en kg)
   quedaría mal (se descontaría 1 kg).
3. **Línea con monto fijo**: la línea guarda el monto exacto como subtotal y un **peso
   estimado** solo para el stock.

## Decisión

Opción 3.

- `packages/core`: `LineaVentaEntrada.subtotalFijoClp` (solo líneas `KG`, monto > 0). Si viene,
  el subtotal de la línea es ese monto; promociones y descuentos funcionan igual.
  `estimarCantidadPorMonto(monto, precioKg) = max(1 g, round(monto × 1000 / precioKg))`.
- `apps/server`: el pedido lleva `montoFijoClp`; el **servidor** recalcula el peso estimado con
  el precio vigente y no confía en el que envía la caja. Un producto por unidad no se puede
  vender por monto (`MONTO_SOLO_KG`).
- En la base no hay columnas nuevas: `sale_items.qty_milli` es el peso estimado y
  `line_total_clp` el monto cobrado. La caja muestra "≈0,503 kg · por monto".

## Consecuencias

- El cliente paga exactamente lo pedido o lo que dice la etiqueta.
- El stock de esos productos queda aproximado (± medio gramo por venta, o el redondeo de la
  balanza). Para pan, verduras y fiambres es aceptable.
- En el comprobante, cantidad × precio puede diferir en $1 del total de la línea en esas
  ventas. `TODO(SII)`: en la Fase 5, revisar si el detalle de la boleta (`QtyItem` ×
  `PrcItem` vs `MontoItem`) admite esa diferencia o si conviene informar la línea como
  "1 × monto" con la unidad de medida en kg.
