# Plan por fases

Cada fase termina con: tests verdes, demo funcionando, y resumen al usuario. No avanzar
a la siguiente sin aprobación.

## Fase 0 — Investigación SII (sin código de producción)
- Ver `docs/SII_BOLETA_ELECTRONICA.md` §4. Entregable: §5 completo + ADR-001.

## Fase 1 — Esqueleto y dominio
- Monorepo pnpm, TypeScript estricto, ESLint, Prettier, Vitest, CI básica.
- `packages/core`: formateo CLP, validación RUT, validación EAN, cálculo neto/IVA desde
  precio con IVA (19 %, verificar tasa vigente), redondeo de efectivo, decodificación de
  códigos de balanza. **Tests exhaustivos.**
- `apps/server`: SQLite + Drizzle, migraciones, modelo de `docs/ARQUITECTURA.md` §3.

## Fase 2 — Base semilla de productos
- Pipeline `data/` según `docs/BASE_PRODUCTOS.md`. Reporte de cobertura.
- Endpoint local `GET /products/lookup/:barcode` (local → semilla → OFF online).

## Fase 3 — Caja (MVP vendible sin SII)
- Pantalla de venta, lector HID, venta rápida, kg, cobro, vuelto, comprobante interno
  impreso por ESC/POS (con `MockProvider`), apertura/cierre de caja, usuarios con PIN.
- Gestión de productos y recepción de mercadería en la caja.
- Prueba con impresora real (Epson/Xprinter) 80 mm y 58 mm.
- Pantalla **"Acerca de"** con la versión y la atribución ODbL de los datos de productos
  (obligatoria, ADR-004). El texto sale de `GET /about` del servidor local (`attribution`,
  `license`, `license_url`, `sources`, `built_at`, leídos de `seed_meta`). Se muestra tal cual,
  con los enlaces a Open Food Facts y a la licencia.

## Fase 4 — Nube + app móvil del dueño
- `apps/cloud` + sincronización (outbox, movimientos de stock).
- `apps/mobile`: inicio, productos, escáner con cámara, editar precio, cambio masivo, stock bajo,
  ventas del día. Notificación de cierre de caja.
- Opcional: fiado / cuenta corriente de vecinos.

## Fase 5 — Boleta electrónica real
- Implementar el provider elegido en ADR-001. Primero en **ambiente de certificación**.
- Timbre PDF417 impreso y verificable; cola offline de envío; consulta de estado; reintentos.
- Proceso de certificación (si estrategia A) o alta con el proveedor (si B).
- Checklist legal de la boleta impresa.

## Fase 6 — Puesta en marcha
- Instalador Windows (Tauri bundle) con `seed.sqlite`, asistente de primera configuración
  (datos del negocio, impresora, prueba de escáner, conexión con el celular por QR).
- Respaldos automáticos (local + nube). Manual de uso de 1 página para el dueño.
