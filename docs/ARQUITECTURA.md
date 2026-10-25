# Arquitectura

## 1. Vista general

```
┌──────────────── LOCAL (almacén) ────────────────┐        ┌──────── NUBE ────────┐
│                                                 │        │                      │
│  apps/pos (Tauri+React)  ──HTTP──►  apps/server │◄─sync─►│  apps/cloud          │◄── apps/mobile
│   lector HID, UI caja              (Fastify +   │        │  (Fastify+Postgres)  │    (Expo, dueño)
│                                     SQLite)     │        │                      │
│  impresora ESC/POS ◄── packages/printer         │        └──────────────────────┘
│                                     │           │
│                          packages/dte ──────────┼──► SII (directo) o proveedor DTE
└─────────────────────────────────────────────────┘
```

- **La caja nunca depende de la nube para vender.** El servidor local (SQLite) es la fuente
  de verdad de ventas y stock. La nube es un espejo para la app del dueño.
- La app móvil escribe **cambios de precio / productos / recepciones** en la nube; el servidor
  local los descarga y aplica. Ventas y stock suben de local → nube.

## 2. Sincronización

- Tablas con `id` UUIDv7, `updated_at`, `version` (entero) y `deleted_at` (soft delete).
- Tabla `outbox` en local y en nube: cada cambio genera un evento (`entity`, `id`, `op`, `payload`).
- Pull/push cada 10 s cuando hay conexión + WebSocket/SSE opcional para cambios de precio inmediatos.
- **Conflictos**: precio y datos de producto → gana la última edición del dueño (nube);
  stock → nunca se sobreescribe, se sincronizan **movimientos** (`stock_movements`), no el saldo.
- Autenticación local ↔ nube con token de dispositivo (registrado por el dueño con un código QR).

## 3. Modelo de datos (núcleo)

```
products(id, barcode UNIQUE, alt_barcodes[], name, brand, format, unit[UN|KG],
         category_id, price_clp INT, cost_clp INT, tax_type[AFECTO|EXENTO],
         extra_tax_code NULL, stock_qty NUMERIC(12,3), stock_min, active, source[SEED|LOCAL],
         seed_ref, created_at, updated_at, version)
categories(id, name, parent_id)
price_history(id, product_id, old_price, new_price, changed_by, device, at)
stock_movements(id, product_id, qty, type[VENTA|RECEPCION|AJUSTE|MERMA|ANULACION], ref_id, at)
sales(id, number, cashier_id, register_id, status[OK|ANULADA], total_clp, rounding_clp,
      payment_method, paid_clp, change_clp, created_at)
sale_items(id, sale_id, product_id, name_snapshot, qty, unit_price_clp, discount_clp, line_total_clp)
tax_documents(id, sale_id, dte_type[39|41], folio, xml, ted, track_id, sii_status,
              sent_at, attempts, last_error)
caf_ranges(id, dte_type, folio_from, folio_to, next_folio, xml_encrypted, expires_at)
cash_sessions(id, register_id, opened_by, opened_at, opening_cash, closed_at, counted_cash)
users(id, name, role, pin_hash)
quick_buttons(id, label, product_id, position)
```

Reglas: montos `INTEGER` CLP; cantidades `NUMERIC(12,3)` (kg); `name_snapshot` y precio
congelados en la venta.

## 4. Módulos de la caja (apps/pos)

- **Pantalla Venta** (única pantalla principal): input de escaneo con foco permanente, lista de
  ítems con letra grande, total gigante, botones de venta rápida, teclado numérico en pantalla.
- **Cobro**: modal con medios de pago, "Paga con", vuelto.
- **Productos**: buscar, editar, crear, imprimir etiqueta.
- **Recepción**, **Caja** (apertura/cierre), **Reportes del día**, **Configuración**
  (impresora, datos del contribuyente, SII).
- Lector de barras: detectar ráfagas de teclas < 50 ms terminadas en Enter como escaneo,
  aunque el foco esté en otro lado.

## 5. Interfaz tributaria (packages/dte)

```ts
interface DocumentoTributarioProvider {
  emitirBoleta(venta: VentaParaDte): Promise<ResultadoEmision>; // folio, TED (string para PDF417), xml
  enviarPendientes(): Promise<ResultadoEnvio[]>;               // reintentos offline
  consultarEstado(trackId: string): Promise<EstadoSii>;
  anular?(ref: RefDocumento): Promise<ResultadoEmision>;        // vía nota de crédito si aplica
}
```

Implementaciones previstas (la elegida se define en ADR-001):
- `MockProvider` — desarrollo; imprime "COMPROBANTE INTERNO – NO VÁLIDO COMO BOLETA".
- `PuenteManualProvider` — Estrategia D (transitoria): no timbra; el cajero emite en el
  emisor gratuito del SII y opcionalmente se registra el folio externo.
- `SiiDirectoProvider` — XML + firma + CAF + API REST de boleta del SII (software propio certificado).
- `ProveedorExternoProvider` — adaptador a un proveedor de DTE con API (p. ej. LibreDTE,
  SimpleAPI, OpenFactura, Facto u otro que se evalúe en Fase 0).

**Clave**: la emisión (folio + timbre) debe poder hacerse **offline** para imprimir al instante;
el envío al SII es asíncrono. Con un proveedor externo esto solo es posible si permite
timbrar localmente con CAF; verificar en Fase 0.

## 6. Impresión (packages/printer)

- ESC/POS crudo vía USB/red (en Tauri: comando Rust, o `node-thermal-printer`/similar en server).
- Plantillas 58 mm (32 col) y 80 mm (48 col).
- Timbre electrónico: generar PDF417 desde el TED (lib `bwip-js`) → imagen raster ESC/POS (`GS v 0`).
- Pulso de apertura de cajón tras cobro en efectivo.
- Elementos mínimos de la representación impresa de la boleta: ver doc SII; no improvisar.

## 7. App móvil (apps/mobile)

Pantallas: Inicio (ventas hoy, stock bajo), Productos (buscar / escanear con cámara →
editar precio), Cambio masivo de precios (por categoría/marca, %), Recepción, Reportes.
Expo + `expo-camera` para escanear códigos. Todo en español de Chile.

## 8. Seguridad

- Certificado digital (.pfx) y clave: solo en el equipo local, cifrados (keychain de SO o
  archivo cifrado con clave derivada). Nunca en la nube ni en el repo.
- CAF (archivos de folios): igual que el certificado.
- API nube: JWT corto + refresh; HTTPS obligatorio.
- Logs sin datos sensibles.
