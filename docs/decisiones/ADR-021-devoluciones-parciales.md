# ADR-021: Devoluciones parciales y ventas del turno

- Fecha: 2026-10-29
- Estado: **Aprobado** (2026-10-29)
- Base: ADR-001 §5 (anulaciones y notas de crédito), ADR-019.

## Contexto

Hasta ahora una venta solo se podía **anular entera**, y el cajero solo la última. En un
almacén es común que el cliente devuelva *un* producto (venía vencido, se equivocó de sabor) o
que haya que reimprimir una venta anterior. Los POS de mercado tienen un historial del turno y
devoluciones parciales.

## Decisión

- **Caja → Ventas del turno** lista todas las ventas del turno abierto (`GET /sales/turno`).
  Cada una se abre para **reimprimir**, **anular** (si no tiene devoluciones) o **devolver
  productos**.
- **Devolución parcial** (`POST /sales/:id/returns`, tablas `sale_returns` y
  `sale_return_items`, migración 0011):
  - Misma autorización que anular: el dueño con su sesión o el cajero con la clave del dueño.
  - Cada línea devuelve lo **proporcional a lo que se pagó por ella** (con su descuento o
    promoción), redondeado al peso; devolver todo lo que quedaba devuelve exactamente lo que
    faltaba. Nunca más de lo pagado ni más cantidad de la vendida (`calcularDevolucion` en
    `packages/core`).
  - Se devuelve por el **mismo medio de pago**. En efectivo sale del cajón del turno abierto
    (baja el esperado del cierre) con el mismo redondeo de la Ley 20.956 (`TODO(SII)`).
  - El **stock** vuelve como un movimiento `ANULACION` con `refId` = la devolución: es una
    reversión de la venta y evita migrar el CHECK de tipos en la caja y la nube.
  - Una venta con devoluciones **ya no se anula entera**: se devuelve el resto.
  - Recordatorio para el cajero: nota de crédito (e-Boleta o DTE 61) y reversar el pago con
    tarjeta o la transferencia. La emisión de la nota de crédito no está automatizada.
  - Viaja a la nube (`sale_returns`) para que el resumen del dueño muestre **ventas netas**.
- El ticket de cierre informa las devoluciones y descuenta las de efectivo.

## Consecuencias

- Las devoluciones solo se hacen con la caja abierta (el efectivo tiene que salir de algún
  turno). Por ahora el historial muestra solo el turno abierto; para devolver una venta de
  otro día habría que buscarla (pendiente si hace falta).
- Falta definir con el SII la nota de crédito parcial (`SII_BOLETA_ELECTRONICA.md` §6).
