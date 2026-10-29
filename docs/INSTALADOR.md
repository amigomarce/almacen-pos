# Instalador de la caja (Tauri + servidor Node)

> **Estado (2026-10-29):** la app de macOS está compilada y probada. El instalador de Windows
> **se genera en GitHub Actions** (workflow manual, ~16 min) y su contenido está revisado, pero
> **falta instalarlo y probarlo en un PC Windows** real. El **`.deb` para Zorin OS Lite**
> (ADR-020) también se genera en GitHub Actions; falta probarlo en el equipo real.

La app instalada es una sola ventana de escritorio que arranca el servidor local como
**sidecar** de Node 22. No requiere que el dueño abra una terminal ni instale Node.

## Qué incluye

- Interfaz React compilada por Vite.
- `server.mjs` (servidor Fastify + lógica de la caja) compilado con esbuild.
- `better-sqlite3` con el binario nativo de la plataforma.
- Migraciones de SQLite, CSV de categorías/marcas y `seed.sqlite` (11.027 productos).
- Runtime oficial de Node 22, como sidecar `almacen-node` (no `node`: en Linux chocaría con
  el Node del sistema en `/usr/bin`).

La base de datos, los respaldos, la clave del SII y `server.log` se crean en el directorio de
datos del usuario:

- **Windows:** `%APPDATA%\cl.almacenpos.caja\`
- **Linux:** `~/.local/share/cl.almacenpos.caja/`
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

### Sin máquina Windows: GitHub Actions

El workflow manual `.github/workflows/instalador-windows.yml` corre en `windows-latest`:
reconstruye la semilla desde Open Food Facts (con caché de `data/raw`), compila y publica el
`.exe` como artefacto `instalador-windows` (se guarda 90 días).

```bash
gh workflow run instalador-windows.yml --ref main
gh run list --workflow instalador-windows.yml --limit 1
gh run download <id> -n instalador-windows -D ./instalador
```

La versión de pnpm sale de `packageManager` en `package.json`; no la repitas en el workflow
(`pnpm/action-setup` falla con dos versiones).

**Revisión del primer `.exe` (corrida 40298970706, 2026-10-26):** 30 MB comprimido, 127 MB
instalado. Trae `almacen-pos.exe`, `node.exe` (v22.23.4 oficial), `server/server.mjs`, las 9
migraciones, los CSV de categorías y marcas, `better-sqlite3` con el binario `win32-x64` y
`seed.sqlite` con 11.039 productos y su atribución ODbL. Se revisó abriéndolo con 7-Zip
(`brew install sevenzip`; `7zz x instalador.exe`), sin ejecutarlo.

### Si compilas desde otro sistema

El script del sidecar acepta el runtime y el target:

```bash
pnpm --filter @almacen/server sidecar \
  --node /ruta/node-v22-win-x64/node.exe \
  --target x86_64-pc-windows-msvc
```

Aun así, el empaquetado NSIS debe ejecutarse en Windows.

## Linux (Zorin OS Lite)

Paquete `.deb` x86_64 para el equipo de la caja (ADR-020). Se compila en **Ubuntu 22.04** para
que sirva en Zorin 17 (base 22.04) y Zorin 18 (base 24.04).

### Generarlo: GitHub Actions

```bash
gh workflow run instalador-linux.yml --ref main
gh run list --workflow instalador-linux.yml --limit 1
gh run download <id> -n instalador-linux -D ./instalador
```

El workflow reconstruye la semilla, compila, muestra el contenido del paquete y la glibc que
pide, y hace una **prueba de humo**: instala el `.deb` en el runner, abre la caja en una
pantalla virtual (Xvfb) y espera a que `/health` responda.

Para compilar en un Ubuntu/Zorin propio:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
pnpm install && pnpm data:build
pnpm --filter @almacen/pos tauri build
```

Salida: `apps/pos/src-tauri/target/release/bundle/deb/almacen-pos_0.1.0_amd64.deb`. En Linux el
`productName` es `almacen-pos` (`tauri.linux.conf.json`): Debian no acepta tildes ni espacios en
el nombre del paquete. En el menú sigue apareciendo "Almacén POS".

### Instalar en el equipo

Conviene un **usuario dedicado** a la caja (por ejemplo `caja`), porque el paso 2 cambia los
atajos de ese usuario.

1. Copia el `.deb` (pendrive) e instálalo; `apt` baja WebKitGTK si falta:
   ```bash
   sudo apt install ./almacen-pos_*_amd64.deb
   ```
2. Con la sesión del usuario de la caja abierta:
   ```bash
   bash /usr/share/almacen-pos/configurar-caja-linux.sh
   ```
   Abre la caja al iniciar sesión, quita la tecla Super, Alt+Tab y otros atajos del
   escritorio, deja la pantalla siempre encendida, oculta los avisos de actualización y agrega
   el usuario al grupo `lp` (impresora USB; pide la clave). Se deshace con `--deshacer`.
3. Cierra sesión y vuelve a entrar. La caja se abre sola en pantalla completa.

Para actualizar: `sudo apt install ./nuevo.deb` con la caja cerrada. Los datos no se tocan.

### Si algo falla

- **Ventana en blanco:** la caja ya desactiva el renderizador DMA-BUF. Si sigue en blanco,
  prueba `WEBKIT_DISABLE_COMPOSITING_MODE=1 almacen-pos` desde una terminal y, si funciona,
  agrégalo a la línea `Exec=` de `~/.config/autostart/almacen-pos.desktop`.
- **Impresora USB:** `ls -l /dev/usb/lp0` debe mostrar el grupo `lp`. Con cola de CUPS,
  créala en *Configuración → Impresoras* con el driver "Raw".
- **Log:** `~/.local/share/cl.almacenpos.caja/server.log`.

## Variables de compilación

Se leen al compilar el binario de Rust (`option_env!`):

```bash
ALMACEN_CLOUD_URL=https://tu-nube.example \
ALMACEN_CONTACTO=dueno@ejemplo.cl \
ALMACEN_NODE=/ruta/a/node22/bin/node \
pnpm --filter @almacen/pos tauri build
```

- `ALMACEN_CLOUD_URL`: valor inicial de la URL de nube; después se puede cambiar en
  **Configuración → Nube y respaldo cifrado** sin recompilar.
- `ALMACEN_CONTACTO`: activa Open Food Facts en línea.
- `ALMACEN_NODE`: runtime que se copia al sidecar en macOS.

Sin esas variables la caja funciona offline, sin sincronización ni Open Food Facts.

En GitHub Actions, el workflow `instalador-windows` toma `ALMACEN_CLOUD_URL` y
`ALMACEN_CONTACTO` de las **variables del repositorio** (`vars.*`). El build `40354376643`
(2026-10-26) se compiló con `ALMACEN_CLOUD_URL=https://almacen-pos-nube.fly.dev`; la URL quedó
grabada en el `.exe` como valor inicial y se puede cambiar desde Configuración.

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

- El `.exe` se genera en CI pero **no se ha ejecutado en Windows**: falta probar instalación,
  arranque del sidecar, semilla e impresora USB (`TODO` en `impresion/transportes.ts`).
- No está firmado: Windows SmartScreen advierte "editor desconocido". En macOS la app no está
  notarizada. Falta firma/notarización en ambos.
- El `.deb` de Linux no se ha probado en un equipo con Zorin OS Lite (RAM, escáner, impresora
  térmica, atajos de xfwm4). Solo hay x86_64.
- No hay autoactualización.
- El puerto es fijo (`3001`); si otra app lo ocupa, el sidecar no arranca. En pruebas se puede
  cambiar con `ALMACEN_PORT`, pero la interfaz compilada apunta a 3001.
- El contacto de Open Food Facts se fija al compilar. La URL de la nube ya se cambia desde
  **Configuración** (ADR-016); `ALMACEN_CLOUD_URL` es solo el valor inicial.
- Si se pierde el equipo, hay que restaurar el respaldo en otro equipo (ver
  [`RESPALDOS.md`](RESPALDOS.md)).
