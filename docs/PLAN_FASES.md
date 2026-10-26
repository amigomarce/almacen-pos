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
- Pantalla de venta, lector HID, venta rápida, kg, cobro, vuelto, comprobante de venta
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
- **Estado del código (2026-10-25):** Etapas 1 (núcleo DTE, ADR-008), 2 (envío + cliente de
  la API, ADR-009), 3 (provider, cola offline y folios persistidos, ADR-010) y 4 (boleta
  impresa, carga de certificado/CAF y activación, ADR-011) hechas y probadas con fixtures.
  `SII_DIRECTO` ya se puede elegir cuando `siiListo` (certificado vigente + CAF + datos
  legales). Falta la **certificación real** con los documentos del dueño.
- **Orden:** primero el **código** (esta fase), después la **certificación**. La fase deja el
  módulo completo y probado con fixtures; la certificación real (set de pruebas, F2117) se hace
  al final, con el certificado y CAF del dueño. Mientras no esté certificado, las instalaciones
  nuevas siguen en D (comprobante de venta + e-Boleta).
- **Pregunta de modalidad en el primer arranque** (lo aprobado en `CLAUDE.md` §2): si el local
  no tiene configuración, la caja muestra una pantalla **bloqueante** antes de la primera venta
  (implementada en la Etapa 4, ADR-011):
  *"¿Cómo emitirá las boletas?"* con **"Con la app del SII"** (`PUENTE_MANUAL`)
  **preseleccionada** y **"Desde esta caja"** (`SII_DIRECTO`) habilitada solo si hay
  certificado, CAF y certificación. No se puede vender hasta confirmar; si ya hay
  configuración no se vuelve a preguntar y el dueño la cambia en Configuración.
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
  (datos del negocio, impresora, prueba de escáner, conexión con el celular por QR).
- **La modalidad de boleta NO se pregunta en el instalador**: la pregunta vive en el **primer
  arranque de la caja** (Fase 5) y el asistente la reutiliza, para que haya un solo lugar donde
  se decide. Si el local ya tiene configuración, el instalador no la repite.
- Al confirmar **"Con la app del SII"** (`PUENTE_MANUAL`, preseleccionada), la caja imprime un
  **comprobante de venta** rotulado "no válido como boleta" y el cajero emite la boleta en
  e-Boleta por el total exacto. Al elegir **"Desde esta caja"** (`SII_DIRECTO`) se advierte el
  trámite del **Formulario N° 2117** y la salida del sistema gratuito (ADR-001).
- Respaldos automáticos (local + nube). Manual de uso de 1 página para el dueño.

### Estado al 2026-10-25 — respaldos (primera etapa de la Fase 6)

**Hecho (ADR-012):**
- Respaldo local automático: copia consistente de SQLite (API de backup, respeta WAL), al
  arrancar y cada 6 h, con un máximo de uno por día (20 h).
- Cada respaldo incluye la base, la clave del SII (si existe) y un manifiesto; permisos
  privados y retención de 14.
- Restauración por consola con la caja detenida, validación del archivo y copia previa
  automática.
- API de respaldos (dueño) y sección **Configuración → Respaldos** con "Respaldar ahora".
- Guía en [`RESPALDOS.md`](RESPALDOS.md).

### Estado al 2026-10-25 — asistente de primera configuración

**Hecho (ADR-013):**
- Tarjeta **Configuración → Primera configuración** con pasos: datos del local, forma de
  emitir, impresora, prueba del lector y vinculación del celular.
- `GET /setup` (solo dueño) resume faltantes, modalidad, impresora e identidad de la caja.
- QR de vinculación generado en el navegador (`toqr`), sin servicio externo.
- Al confirmar la modalidad en el primer arranque, la caja lleva directo a esta guía.
- La app móvil lee el QR con `expo-camera` y completa instalación, token y nombre; la carga
  manual sigue como respaldo.

### Estado al 2026-10-26 — instalador (sidecar)

**Hecho (ADR-014):**
- El servidor se compila con esbuild y viaja como sidecar de Node 22 dentro de Tauri, con
  `better-sqlite3`, migraciones, CSV y `seed.sqlite`.
- Arranque y parada del sidecar desde Rust; base, respaldos y clave del SII en el directorio
  de datos del usuario; log en `server.log` y watchdog si la app muere.
- `pnpm --filter @almacen/pos tauri build` genera la app de macOS; se abrió y verificó el
  arranque, migración, semilla, respaldo y `/health`.
- Configuración NSIS para Windows y guía en [`INSTALADOR.md`](INSTALADOR.md).
- Primer arranque de una base vacía: crea dueño, caja y cajero antes del PIN (ADR-015).

### Estado al 2026-10-26 — manual del dueño

**Hecho:** manual rápido de una página en [`MANUAL.md`](MANUAL.md), con versión imprimible en
HTML/PDF ([`manual-1-pagina.html`](manual-1-pagina.html) y
[`manual-1-pagina.pdf`](manual-1-pagina.pdf)). Cubre primer arranque, venta, cierre, anulación,
productos nuevos, boleta electrónica, respaldos y todas las pestañas de la app del dueño.

**Pendiente de la Fase 6:** generar y probar el `.exe` en Windows/CI, respaldo automático a un
bucket de nube, firma/notarización y URL de nube configurable desde la app.

## Mejoras futuras (backlog)

- **Imágenes de producto en la caja y el móvil.** La semilla y Open Food Facts traen
  `image_url` (8.379 de 11.027 productos de la semilla) y el lookup la devuelve, pero hoy la
  POS no la declara ni la muestra, `products` no la guarda y la sincronización no la lleva.
  Propuesta: agregar `image_url` a `products` (local + nube), conservarla al dar de alta,
  mostrarla con placeholder en alta/venta/productos y sincronizarla. Para uso offline hay que
  cachear los archivos; las fotos de OFF son CC BY-SA y requieren atribución propia. Detalle
  en [`BASE_PRODUCTOS.md`](BASE_PRODUCTOS.md) §4.
