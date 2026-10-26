# ADR-014: Instalador de escritorio con el servidor Node como sidecar

- Fecha: 2026-10-26
- Estado: **Aprobado** (2026-10-26)
- Base: ADR-005 (Tauri como envoltura) y Fase 6 (`docs/PLAN_FASES.md`).

## Contexto

La app de escritorio Tauri solo empaquetaba la interfaz: para vender había que levantar
`apps/server` por separado. El instalador de la Fase 6 debe dejar una sola aplicación que
arranque la caja, con su base local, la semilla de productos, las migraciones y los respaldos,
sin pedirle al dueño que abra una terminal ni instale Node.

El servidor usa `better-sqlite3` (módulo nativo) y archivos de datos (`seed.sqlite`,
migraciones, CSV de categorías). Un `pkg`/SEA de Node añade complejidad para el addon nativo y
para extraer recursos; el equipo ya tiene Node 22 disponible en el equipo de la caja.

## Decisión

### Empaquetado

- **Servidor**: esbuild compila `apps/server/src/main.ts` a un único `server.mjs` (ESM,
  `better-sqlite3` externo). El paquete `better-sqlite3` se copia con sus `prebuilds` de
  macOS/Windows/Linux, así que el mismo recurso sirve para el `.app` y el `.exe`.
- **Recursos**: `apps/pos/src-tauri/resources/server/` contiene `server.mjs`, el paquete de
  SQLite, `drizzle/` (migraciones), `data/` (CSV) y `data/out/seed.sqlite`.
- **Runtime**: se copia el binario oficial de **Node 22** a
  `src-tauri/binaries/node-<target-triple>[.exe]` y Tauri lo declara como `externalBin`.
  No se usa el Node de Homebrew: depende de `libnode` y otras dylibs y no es autocontenido.
- El script `apps/server/scripts/preparar-sidecar.mjs` hace todo lo anterior. Falla si falta
  `data/out/seed.sqlite` o si el runtime no es Node 22+.
- `build:tauri` ejecuta el sidecar antes de Vite; `tauri.conf.json` incluye
  `externalBin: ["binaries/node"]` y `resources: { "resources/server/": "server/" }`.

### Arranque y parada

- En **debug** Tauri no arranca el sidecar: `beforeDevCommand` levanta el servidor y Vite como
  hasta ahora (`pnpm dev:pos:app`). El sidecar es solo para la versión compilada.
- En **release** Rust lo arranca con `tauri-plugin-shell`:
  - recursos: `resource_dir()/server`;
  - datos escribibles: `app_data_dir()` (`almacen.sqlite`, `respaldos/`, `sii.key`,
    `server.log`);
  - variables: `ALMACEN_DB`, `ALMACEN_RESPALDOS`, `ALMACEN_SII_KEY`, `ALMACEN_DATA_DIR`,
    `ALMACEN_MIGRACIONES`, `ALMACEN_SEMILLA`, `PORT=3001`, `HOST=127.0.0.1`,
    `NODE_ENV=production`;
  - `ALMACEN_PORT` permite cambiar el puerto en pruebas;
  - la salida del servidor se agrega a `server.log` (en Windows no hay consola).
- Al cerrar la app, `RunEvent::Exit` mata el sidecar. Además el servidor recibe
  `ALMACEN_PADRE_PID` y se apaga solo si el proceso padre desaparece (cierre forzado o caída).
- `ALMACEN_CLOUD_URL` y `ALMACEN_CONTACTO` se pueden fijar al compilar con `option_env!`; si no,
  la caja funciona offline y sin Open Food Facts.

### Windows

- `apps/pos/src-tauri/tauri.windows.conf.json` limita el bundle a NSIS e instala por usuario
  (sin administrador).
- El instalador se genera en Windows (o CI) porque NSIS/WiX no se compilan desde macOS.
- `pnpm data:build` o un artefacto previo debe dejar `data/out/seed.sqlite` antes de empaquetar.
- El `.exe` no está firmado: Windows SmartScreen puede advertir. La firma de código queda para
  la entrega comercial.

## Consecuencias

- La app instalada es autocontenida: interfaz + servidor + Node + seed + migraciones.
- El instalador pesa ~135 MB sin comprimir (Node 22 ~108 MB); es el costo de no reescribir el
  servidor y de usar el addon SQLite nativo.
- La base y los respaldos quedan en el directorio de datos del usuario, no dentro del bundle
  (el bundle puede ser de solo lectura).
- El sidecar requiere Node 22; el script rechaza Node 20 y el Node dinámico de Homebrew.
- Quedan pendientes: firma/notarización, autoactualización, URL de nube configurable desde la
  app y generar el `.exe` en Windows/CI.

## Verificación

- `pnpm --filter @almacen/server sidecar --node <node22-oficial>` genera recursos y binario.
- `cargo check` en `src-tauri` compila el arranque del sidecar.
- `pnpm --filter @almacen/pos tauri build --bundles app` genera `Almacén POS.app` (134 MB).
- La app compilada se abrió en macOS: arrancó el sidecar, migró la base en
  `~/Library/Application Support/cl.almacenpos.caja`, cargó 11.027 productos de la semilla,
  creó el primer respaldo y respondió `/health`.
- Al terminar el proceso de la app, el sidecar se apagó (watchdog de `ALMACEN_PADRE_PID`).
- El bundle de Windows no se generó en este entorno (requiere Windows/CI); la configuración
  NSIS y el script de sidecar quedan listos.
