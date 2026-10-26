# Instalador de la caja (Tauri + servidor Node)

La app instalada es una sola ventana de escritorio que arranca el servidor local como
**sidecar** de Node 22. No requiere que el dueño abra una terminal ni instale Node.

## Qué incluye

- Interfaz React compilada por Vite.
- `server.mjs` (servidor Fastify + lógica de la caja) compilado con esbuild.
- `better-sqlite3` con sus binarios nativos.
- Migraciones de SQLite, CSV de categorías/marcas y `seed.sqlite` (11.027 productos).
- Runtime oficial de Node 22.

La base de datos, los respaldos, la clave del SII y `server.log` se crean en el directorio de
datos del usuario:

- **Windows:** `%APPDATA%\cl.almacenpos.caja\`
- **macOS:** `~/Library/Application Support/cl.almacenpos.caja/`

## Requisitos para compilar

- Node 22 **oficial** (no el de Homebrew, que depende de `libnode` y otras dylibs).
- pnpm 12 y Rust (para Tauri).
- `data/out/seed.sqlite`. Si no existe:
  ```bash
  pnpm data:build
  ```
  o copia el artefacto de la base semilla generado por el pipeline de datos.
- En Windows: Visual Studio Build Tools (C++), WebView2 (Tauri lo instala si falta) y NSIS
  (Tauri lo descarga).

## Compilar en macOS

```bash
pnpm install
pnpm data:build   # si aún no tienes data/out/seed.sqlite

# Node 22 oficial (ejemplo: descarga el .tar.gz de nodejs.org y descomprímelo)
ALMACEN_NODE=/ruta/a/node-v22/bin/node \
  pnpm --filter @almacen/pos tauri build
```

Salida: `apps/pos/src-tauri/target/release/bundle/macos/Almacén POS.app` y el `.dmg`.
Para validar sin firmar ni empaquetar:

```bash
ALMACEN_NODE=/ruta/a/node-v22/bin/node \
  pnpm --filter @almacen/pos tauri build --bundles app
```

La app compilada arranca el sidecar, migra la base, carga la semilla y crea el primer respaldo.
El log del servidor queda en el directorio de datos.

## Compilar en Windows

El instalador NSIS se genera en Windows (o en CI de Windows); no se compila desde macOS.

```powershell
pnpm install
pnpm data:build

# Node 22 oficial instalado; process.execPath se copia como sidecar
pnpm --filter @almacen/pos tauri build
```

Salida:
`apps\pos\src-tauri\target\release\bundle\nsis\Almacén POS_0.1.0_x64-setup.exe`.

El bundle de Windows usa `tauri.windows.conf.json`: solo NSIS e instalación por usuario (sin
administrador).

También está el workflow manual `.github/workflows/instalador-windows.yml`: reconstruye la
semilla desde Open Food Facts (con caché de `data/raw`), compila y publica el `.exe` como
artefacto. La primera corrida puede tardar por la descarga de los exports.

### Si compilas desde otro sistema

El script del sidecar acepta el runtime y el target:

```bash
pnpm --filter @almacen/server sidecar \
  --node /ruta/node-v22-win-x64/node.exe \
  --target x86_64-pc-windows-msvc
```

Aun así, el empaquetado NSIS debe ejecutarse en Windows.

## Variables de compilación

Se leen al compilar el binario de Rust (`option_env!`):

```bash
ALMACEN_CLOUD_URL=https://tu-nube.example \
ALMACEN_CONTACTO=dueno@ejemplo.cl \
ALMACEN_NODE=/ruta/a/node22/bin/node \
pnpm --filter @almacen/pos tauri build
```

- `ALMACEN_CLOUD_URL`: activa la sincronización con la nube.
- `ALMACEN_CONTACTO`: activa Open Food Facts en línea.
- `ALMACEN_NODE`: runtime que se copia al sidecar en macOS.

Sin esas variables la caja funciona offline, sin sincronización ni Open Food Facts.

## Probar la app compilada

1. Ábrela. En una base nueva debe mostrar **Configura la caja**: nombre del dueño, PIN y
   repetición, nombre de la caja y cajero opcional (ADR-015).
2. Revisa `server.log` en el directorio de datos: debe decir `Server listening at
   http://127.0.0.1:3001`.
3. Completa la instalación; después aparecen la pregunta de modalidad y el asistente.
4. En otra terminal: `curl http://127.0.0.1:3001/health` (mientras la app está abierta).
5. Vende una prueba y cierra la caja. Debe aparecer un respaldo en `.../respaldos/`.
6. Cierra la app y verifica que no quede un proceso `node` escuchando en 3001.

## Manual del dueño

El manual rápido de una página está en [`MANUAL.md`](MANUAL.md); la versión para imprimir o
guardar como PDF es [`manual-1-pagina.html`](manual-1-pagina.html) /
[`manual-1-pagina.pdf`](manual-1-pagina.pdf). Incluye la caja y la app del dueño.

## Limitaciones actuales

- El `.exe` no está firmado: Windows SmartScreen puede advertir. Falta firma/notarización.
- No hay autoactualización.
- El puerto es fijo (`3001`); si otra app lo ocupa, el sidecar no arranca. En pruebas se puede
  cambiar con `ALMACEN_PORT`, pero la interfaz compilada apunta a 3001.
- La URL de la nube y el contacto de Open Food Facts se fijan al compilar; configurarlos desde
  la app queda pendiente.
- Si se pierde el equipo, hay que restaurar el respaldo en otro equipo (ver
  [`RESPALDOS.md`](RESPALDOS.md)).
