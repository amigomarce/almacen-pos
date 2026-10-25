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
- **Modalidad de boleta** (`store_settings.dte_provider`) elegible en la configuración de
  la caja. En instalaciones reales el valor inicial es `PUENTE_MANUAL` (Estrategia D);
  `MOCK` solo en desarrollo y tests, y si la caja está en `MOCK` debe mostrar un **aviso
  visible permanente** ("MODO PRUEBA – no emite boletas"). Con `PUENTE_MANUAL`, al cobrar
  se muestra el total para emitir en e-Boleta y un campo opcional "folio SII".
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

### Estado al 2026-10-25 — nube, sincronización y app móvil (scaffold)

**Hecho (Etapas 16–18):**
- `apps/cloud` (Fastify + Drizzle + PostgreSQL/Supabase, ADR-007): migraciones y modelo de
  nube (`installations`, `products`, `categories`, `stock_movements`, `sales`, `sale_items`,
  `outbox`, `cash_closes`), todo con `owner_id` (multi-local).
- **Sincronización** (`packages/sync` + `apps/server/sincronizacion`): outbox local encolado
  dentro de cada transacción; push/pull cada 10 s con reintentos; el dueño gana los conflictos
  por `version`; el stock viaja como movimientos (nunca se sobrescribe el saldo).
- **API del dueño** (JWT de Supabase): productos (listar/ver/editar precio), cambio masivo
  por categoría/marca (+%), recepción (stock + costo promedio) y reportes (ventas del día,
  stock bajo, último cierre de caja).
- **Vinculación de la caja** por QR: token de dispositivo (se guarda solo su SHA-256).
- `apps/mobile` (Expo 58 + React Native 0.88): login con Supabase Auth, Inicio (ventas del
  día, stock bajo, último cierre), Productos (buscar y editar precio), Cambio masivo (por
  marca/categoría) y Recepción (código de barras o cámara). Cliente de la API en TS puro,
  con tests. `pnpm dev:mobile` arranca Expo.

**Flujos completos extremo a extremo:** precio del móvil → caja; recepción del móvil → caja;
ventas/stock de la caja → nube; cierre de caja → aviso en Inicio del móvil.

**Pendiente en esta fase:**
- Probar la app en un emulador o teléfono (no se ejecutó en el entorno de desarrollo) y
  pulir la UI; el escáner con cámara necesita un dispositivo real.
- Provisionar Supabase para la prueba real: `CLOUD_DATABASE_URL` y `SUPABASE_JWT_SECRET`
  (nube), `CLOUD_URL` (caja), `EXPO_PUBLIC_*` (móvil).
- Fiado / cuenta corriente (opcional) no se hizo.

**TODOs menores:** `GET /report/sales/today` usa "últimas 24 h" (falta hora de Chile); el
`outbox` local no se poda; el saldo de stock de la nube se agrega en memoria.

## Fase 5 — Boleta electrónica real
- Implementar `SiiDirectoProvider` (Estrategia A, ADR-001). Primero en **ambiente de
  certificación** (`apicert`/`pangal`); nunca producción en desarrollo.
- CAF y certificado digital locales y cifrados; TED; firma; `EnvioBOLETA` en lotes;
  cola offline con envío dentro de 1 hora desde que vuelve la conexión; consulta de
  estado; reintentos. PDF417 recomendado pero opcional.
- Proceso de certificación ante el SII (set de pruebas generado automáticamente).
- El provider es **configurable por instalación**: la Estrategia D (`PuenteManualProvider`
  + e-Boleta) sigue siendo una modalidad soportada para locales que no certifiquen.
- Guía de paso a producción para el dueño: certificado digital, postulación, y el
  **Formulario N° 2117** presencial en el SII para salir del sistema gratuito (no se hace
  en línea). Volver a D después es posible en línea (máx. 3 h), pero no es contingencia.
- Contingencia: Estrategia B (OpenFactura) solo si A queda bloqueada.
- Checklist legal de la boleta (impresa o virtual).

## Fase 6 — Puesta en marcha
- Instalador Windows (Tauri bundle) con `seed.sqlite`, asistente de primera configuración
  (datos del negocio, impresora, prueba de escáner, conexión con el celular por QR, y
  **modalidad de boleta**: "¿Emitirá boletas con la app del SII o desde esta caja?" →
  `PUENTE_MANUAL` o `SII_DIRECTO` cuando esté disponible).
- Respaldos automáticos (local + nube). Manual de uso de 1 página para el dueño.
