# ADR-022: Fiado / cuenta corriente de vecinos

- Fecha: 2026-10-30
- Estado: **Aprobado** (2026-10-29)
- Base: CLAUDE.md §4 ("Fiado" opcional, Fase 4), ADR-021 (devoluciones).

## Contexto

En el almacén de barrio se le fía a vecinos conocidos: se anota en un cuaderno y pagan cuando
pueden. El cuaderno se pierde, no dice cuánto se debe en total y no avisa cuando alguien ya
debe demasiado.

## Decisión

- **`FIADO` es un medio de pago** (`packages/core`). No se redondea, no entra plata a la caja y,
  como es una venta, **lleva boleta al vender** (`requiereBoleta`; `TODO(SII)` en §6).
- **Vecinos** (`customers`): nombre, teléfono, nota, **límite** opcional y activo. Los crea y edita
  el dueño; no se borran, se desactivan (sin cuenta habilitada no se les fía).
- **Cuenta corriente** (`customer_ledger`), solo se agregan filas: `VENTA` (+), `ABONO`,
  `ANULACION`, `DEVOLUCION` (−) y `AJUSTE` (± con motivo, solo el dueño). El saldo es la suma.
- **Límite**: no bloquea. Si la venta lo supera, la caja pide la **clave del dueño** (o el dueño
  con su sesión) y el movimiento queda marcado como autorizado.
- **Abonos**: con la caja abierta y su medio (efectivo, tarjeta o transferencia); no pueden pasar
  la deuda. Los de efectivo **suman al esperado del cierre** (`abonos` en la cuadratura). Se
  imprime un recibo interno (no es boleta) con el saldo que quedó.
- Anular o devolver una venta fiada la **descuenta sola** de la cuenta.
- Caja: **Cobrar → Fiado (F)** con buscador de vecinos y pestaña **Fiado** (deudas, abonos,
  movimientos; alta, edición y ajustes del dueño). Nube: tablas espejo y `GET /report/fiado`;
  el celular muestra el total y los deudores en **Inicio**.

## Consecuencias

- Agregar `FIADO` cambió la restricción de medios de pago: en SQLite eso reconstruye `sales` y
  `sale_returns` (migración 0013). `migrar()` ahora apaga las claves foráneas fuera de la
  transacción y verifica la integridad; sin eso, la migración fallaba en bases con ventas.
- La nube debe desplegarse antes que las cajas nuevas: la nube anterior rechaza los eventos de
  vecinos y movimientos.
- Pendiente con el SII/contador: confirmar que la boleta se emite al vender fiado.
