# CLAUDE.md — Sistema POS "Almacén de Barrio"

Este archivo es la memoria del proyecto para Claude Code. Léelo completo al iniciar cada sesión
y luego lee los documentos de `docs/` que correspondan a la tarea.

## 1. Qué estamos construyendo

Un sistema de punto de venta (POS) para un **almacén / minimarket de barrio en Chile**
(un solo local, 1–2 cajas, dueño que no es experto en tecnología), compuesto por:

1. **App de caja (POS)** — escritorio, pantalla táctil o mouse, lector de código de barras,
   impresora térmica de boletas. Debe funcionar **sin internet** (offline-first).
2. **App móvil del dueño** — ver inventario y stock bajo, ventas del día, y **modificar precios**
   desde el celular. Los cambios llegan a la caja automáticamente.
3. **Base de datos semilla de productos chilenos** — miles de productos con código de barras
   (EAN-13/EAN-8), nombre, marca, formato y categoría, para que el dueño NO tenga que
   inventariar producto por producto: escanea, el sistema lo reconoce, solo pone precio y stock.
4. **Emisión de boleta electrónica válida ante el SII** (tipo DTE 39 afecta / 41 exenta), o
   **comprobante de venta + e-Boleta del SII** mientras la instalación no esté certificada (§2).

Contexto detallado del negocio: `docs/CONTEXTO_NEGOCIO.md`.
Arquitectura y stack: `docs/ARQUITECTURA.md`.
Base de productos: `docs/BASE_PRODUCTOS.md`.
SII y boleta electrónica: `docs/SII_BOLETA_ELECTRONICA.md`.
Plan por fases: `docs/PLAN_FASES.md`.

## 2. Regla de oro: boleta electrónica — dos modalidades (Fase 0 aprobada)

La Fase 0 está **completada y aprobada** (`docs/decisiones/ADR-001-estrategia-sii.md`). La
decisión es **D ahora → A como objetivo**: mientras la instalación no esté certificada ante el
SII, la caja emite un **comprobante de venta** rotulado "NO VÁLIDO COMO BOLETA" y el dueño emite
la boleta en la **app e-Boleta del SII**; después de la certificación puede emitir la boleta
**desde esta aplicación** (`SiiDirectoProvider`).

Reglas que no se negocian:

- **La modalidad se pregunta en el primer arranque de la caja**, en una pantalla bloqueante
  antes de la primera venta (no en el instalador: así también cubre instalaciones que se abren
  sin él). La pregunta es *"¿Cómo emitirá las boletas?"* con dos opciones:
  **"Con la app del SII"** (`PUENTE_MANUAL`, preseleccionada) o **"Desde esta caja"**
  (`SII_DIRECTO`). Es **obligatoria**: no se puede vender hasta confirmar.
- Si ya existe configuración del local, **no se vuelve a preguntar**; el dueño puede cambiarla
  cuando quiera en Configuración. Queda en `store_settings.dte_provider`.
- **`SII_DIRECTO` solo se habilita si hay certificado y CAF cargados** y la certificación ya se
  hizo. No se puede elegir una modalidad que todavía no sabe emitir.
- **Un solo sistema de boletas por RUT** (ADR-001): en modalidad D esta app **no emite DTE**;
  al pasar a A el dueño deja de usar e-Boleta. El paso D → A exige el **Formulario N° 2117**
  presencial; volver de A → D es en línea (máx. 3 h) y no sirve como contingencia.
- **El código se desarrolla antes que la certificación.** La Fase 5 deja el módulo completo y
  probado con fixtures; la certificación real (set de pruebas, F2117) se hace **después**, con
  el certificado y CAF del dueño. Hasta entonces, las instalaciones nuevas quedan en D.
- Todo lo tributario va detrás de `DocumentoTributarioProvider`; la lógica de venta **nunca**
  conoce el provider concreto.
- Nunca uses el ambiente de **producción** del SII (`api.sii.cl`, `rahue.sii.cl`) en desarrollo.
  Solo certificación (`apicert.sii.cl`, `pangal.sii.cl`, `maullin.sii.cl`).

## 3. Principios de producto (no negociables)

- **Simple antes que completo.** El cajero es probablemente el dueño, un familiar o un
  adolescente. Botones grandes, pocas pantallas, todo en español de Chile.
- **Venta en ≤ 3 acciones**: escanear → (repetir) → cobrar. Sin popups innecesarios.
- **Teclado primero**: el lector de barras funciona como teclado (HID); el campo de
  escaneo debe tener foco permanente. Atajos: F2 buscar, F4 cantidad, F12 cobrar, Esc cancelar.
- **Offline-first**: la caja vende aunque se caiga internet. Las boletas pendientes de envío
  al SII quedan en cola y se reintentan (dentro de los plazos legales, ver doc SII).
- **El dinero se guarda en pesos enteros (CLP, `INTEGER`)**. Nunca `float` para montos.
- **Precios con IVA incluido** en la UI y en la boleta (así funciona el comercio minorista chileno).
  El neto e IVA se calculan solo al generar el documento tributario.
- **Nada se borra**: ventas, boletas, anulaciones y cambios de precio quedan auditados.
- **Datos sensibles** (certificado digital .pfx, su clave, archivos CAF, tokens) jamás se
  commitean ni se loguean. Van en `secrets/` (en `.gitignore`) o en el keychain del SO.

## 4. Particularidades del almacén chileno que el sistema DEBE soportar

- Productos **sin código** (pan, verduras, huevos sueltos, cigarros sueltos, bolsas):
  botones de "venta rápida" configurables y venta por **peso (kg)** o por monto.
- **Códigos de balanza** (EAN-13 que empiezan con prefijo 20–29) con peso o precio embebido.
- **Productos con impuestos adicionales**: bebidas azucaradas, alcoholes (ILA) — ver doc SII.
- **Productos exentos de IVA** (pocos, pero existen) → boleta exenta o línea exenta.
- **Medios de pago**: efectivo, débito/crédito (POS externo tipo Transbank/Getnet/SumUp/etc.),
  transferencia. Registrar el medio de pago en cada venta.
- **Redondeo de efectivo** a múltiplo de $10 cuando corresponda (verificar normativa vigente
  en Fase 0; solo aplica a pagos en efectivo y sobre el total).
- **"Fiado" / cuenta corriente** de vecinos (libreta digital): opcional, Fase 4.
- **Promociones simples**: "2x $1.500", precio por pack.
- **Stock negativo permitido** (con alerta): en un almacén real se vende aunque el sistema
  diga 0; no se debe bloquear la venta.

## 5. Stack (resumen — detalle en docs/ARQUITECTURA.md)

- Monorepo con **pnpm workspaces** + TypeScript estricto en todo.
- `apps/pos` — **Tauri 2 + React + Vite** (app de escritorio liviana; Windows es el SO más
  probable en el local, desarrollo en macOS). Impresión ESC/POS desde el lado Rust/Node.
- `apps/server` — servidor local en la caja: **Node 22 + Fastify + SQLite (better-sqlite3)
  + Drizzle ORM**. Es la fuente de verdad del local.
- `apps/cloud` — API de sincronización: **Fastify + PostgreSQL** (o Supabase), para la app móvil.
- `apps/mobile` — **Expo (React Native)** para el dueño (iOS/Android).
- `packages/core` — dominio puro: productos, ventas, cálculo de IVA, redondeo, validación RUT.
- `packages/dte` — generación de XML de boleta, timbre (TED), firma, cliente SII o proveedor.
- `packages/printer` — plantillas ESC/POS (58 mm y 80 mm), timbre PDF417.
- `data/` — scripts ETL de la base de productos chilenos.

Si propones cambiar el stack, explica por qué en un ADR en `docs/decisiones/` antes de hacerlo.

## 6. Comandos

```bash
pnpm install
pnpm dev:pos         # caja en http://127.0.0.1:5173 + server local (Tauri más adelante, ADR-005)
pnpm dev:mobile      # app del dueño (Expo)
pnpm dev:cloud       # API de sincronización
pnpm test            # vitest en todos los paquetes
pnpm lint && pnpm typecheck
pnpm data:build      # reconstruye la base semilla de productos
pnpm dev:server      # servidor local (Fastify + SQLite) en 127.0.0.1:3001
pnpm db:seed         # datos de prueba en apps/server/var/almacen.sqlite (PINs: dueño 1234, cajero 0000)
pnpm coverage        # tests con umbrales de cobertura (core ≥ 95 %, dte y printer ≥ 90 %)
pnpm --filter @almacen/server db:generate   # nueva migración tras cambiar schema.ts
pnpm --filter @almacen/server sii:cargar --cert cert.pem --clave clave.pem \
  --rut-envia 76.086.428-5 --fch-resol 2026-01-01 --nro-resol 80 --caf caf39.xml
pnpm --filter @almacen/server respaldo:crear     # respaldo manual de la base
pnpm --filter @almacen/server respaldo:listar
pnpm --filter @almacen/server respaldo:restaurar --respaldo var/respaldos/<carpeta> --si
```
Requiere Node 22 (`.nvmrc`).
(Créalos en el `package.json` raíz si no existen.)

## 7. Cómo trabajar en este repo

- Antes de cada fase: lee `docs/PLAN_FASES.md`, propone un plan corto y espera aprobación.
- Escribe **tests** para todo lo que toque dinero, IVA, redondeo, stock y XML del SII.
  `packages/core` y `packages/dte` deben tener cobertura alta.
- Commits pequeños, en español, formato `tipo(ámbito): descripción`.
- Toda decisión no obvia → ADR corto en `docs/decisiones/ADR-XXX-titulo.md`.
- Si algo de la normativa SII es dudoso, **no inventes**: márcalo como `// TODO(SII): verificar`
  y agrégalo a la lista de preguntas en `docs/SII_BOLETA_ELECTRONICA.md` §6.
- UI en español de Chile: "Cobrar", "Vuelto", "Boleta", "Anular", "Precio", "Stock", "$1.290"
  (punto como separador de miles, sin decimales).
- Formato de RUT: `12.345.678-5`, validar dígito verificador (módulo 11).

## 8. Fuera de alcance (por ahora)

Factura electrónica (DTE 33), multi-sucursal, e-commerce, integración directa con el
terminal de pago con tarjeta, contabilidad. Diseñar sin impedirlos, pero no construirlos.
