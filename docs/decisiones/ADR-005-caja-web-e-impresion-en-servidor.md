# ADR-005: Caja como app web servida por el servidor local; impresión desde el servidor

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25, por el usuario)

## Contexto

`CLAUDE.md` §5 define `apps/pos` con **Tauri 2 + React + Vite** y dice que la impresión ESC/POS
va "desde el lado Rust/Node". Al abrir la Fase 3:

1. El equipo de desarrollo **no tiene Rust instalado** (Tauri lo necesita para compilar).
2. Todo lo que necesita hardware (impresora térmica, cajón) ya pasa por `apps/server`, que
   corre en el mismo equipo de la caja y es la fuente de verdad (Node 22).
3. El lector de barras USB funciona como **teclado** (HID): no necesita código nativo, lo lee
   cualquier ventana con foco.
4. En la Fase 4 la app móvil también querrá imprimir etiquetas en la impresora del local.

## Opciones consideradas

1. **Imprimir desde Rust (comando Tauri)**: obliga a escribir y mantener código Rust para USB
   en Windows y macOS, y la impresora solo sirve a esa ventana.
2. **Imprimir desde el servidor local (Node)**: `packages/printer` genera los bytes ESC/POS
   (código puro, testeable sin impresora) y `apps/server` los envía por:
   red (TCP 9100), cola de impresión del sistema en modo RAW (Windows / CUPS en macOS), o
   archivo (para tests y demos).
3. Imprimir desde el navegador (`window.print`): no sirve para ESC/POS (sin cajón, sin control
   del corte, márgenes impredecibles).

## Decisión

- **Opción 2**: la UI de la caja pide `POST /print/...` al servidor local; el servidor imprime.
- `apps/pos` es una app **React + Vite** que funciona en cualquier navegador apuntando a
  `http://127.0.0.1:3001`. **Tauri 2 queda como envoltura** (ventana a pantalla completa,
  arranque del servidor como proceso hijo, instalador), sin lógica propia. Se agrega cuando
  se instale Rust; la Fase 3 se puede desarrollar y probar completa sin Tauri.
- El stack no cambia: Tauri sigue siendo la forma de distribución en el local (Fase 6).

## Consecuencias

- Se puede desarrollar y probar la caja en el navegador del Mac, y probar los tickets como
  texto/archivo sin impresora.
- El servidor debe escuchar solo en `127.0.0.1` (ya lo hace) y exigir sesión con PIN para
  vender, anular o cambiar precios.
- Cola RAW en Windows: hay que verificar con la impresora real del usuario cuál transporte
  funciona mejor (USB con driver del fabricante → cola RAW; o red).
  `TODO`: probar en Windows con impresora real (Fase 3, paso de hardware).
- Si algún día la caja corre en un equipo distinto al del servidor, la impresión sigue
  funcionando porque la impresora es del servidor, no de la ventana.
