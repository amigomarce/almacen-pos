# ADR-020: Caja en Linux (Zorin OS Lite)

- Fecha: 2026-10-29
- Estado: Aprobado

## Contexto

El equipo de la caja será un PC de bajos recursos con **Zorin OS Lite**: XFCE sobre X11, base
Ubuntu 22.04 (Zorin 17) o 24.04 (Zorin 18). Hasta ahora la caja se empaquetaba para Windows
(NSIS, ADR-014) y macOS (desarrollo). Tauri 2 en Linux usa **WebKitGTK 4.1** en vez de WebView2,
así que los ajustes de kiosco de Windows (`kiosco.rs`) no aplican.

## Opciones consideradas

1. **`.deb`** compilado en Ubuntu 22.04: `apt` instala WebKitGTK y GTK como dependencias; se
   integra al menú y se actualiza con `apt install ./nuevo.deb`.
2. **AppImage**: un solo archivo, pero trae su propia copia de WebKitGTK (más pesado) y no
   declara dependencias; peor opción para un equipo con poco disco y RAM.
3. **Navegador en modo kiosco + servidor como servicio**: sin Tauri en Linux. Rompe la
   paridad con Windows (bloqueo del cierre con caja abierta, marca de cierre inesperado).

## Decisión

- Se empaqueta **solo `.deb` x86_64**, compilado en **`ubuntu-22.04`** (glibc 2.35) para que
  el mismo paquete sirva en Zorin 17 y 18. Workflow manual `instalador-linux.yml`, con prueba
  de humo: instala el `.deb`, abre la caja en Xvfb y espera `/health`.
- En Linux el `productName` es `almacen-pos` (`tauri.linux.conf.json`): Tauri arma el nombre
  del paquete con él y Debian no acepta "almacén pos". Una plantilla `.desktop` mantiene
  "Almacén POS" en el menú. Los datos no cambian de lugar: dependen del `identifier`.
- El sidecar de Node pasa a llamarse **`almacen-node`** en todas las plataformas: el `.deb`
  instala los `externalBin` en `/usr/bin`, y `node` chocaría con el paquete `nodejs`.
- `better-sqlite3` viaja **solo con el binario del target** (antes los 8, ~16 MB). El de Linux
  pide glibc 2.34.
- WebKitGTK arranca con `WEBKIT_DISABLE_DMABUF_RENDERER=1` (salvo que el equipo ya la
  defina): con gráficos antiguos el renderizador DMA-BUF deja la ventana en blanco.
- Kiosco: la pantalla completa y el bloqueo del cierre son los mismos de Tauri. WebKitGTK no
  tiene atajos de navegador propios y `src/kiosco.ts` anula el resto. La tecla Super y Alt+Tab
  son de xfwm4 y los quita `configurar-caja-linux.sh` (incluido en el `.deb`, en
  `/usr/share/almacen-pos/`), que además deja inicio automático, pantalla sin apagarse y el
  usuario en el grupo `lp`. No se usa un *grab* de teclado desde Rust: si la app se cuelga, el
  equipo queda sin teclado.
- Impresión: sin cambios. CUPS con `lp -o raw` (`cups-client` es dependencia del `.deb`) o
  directo a `/dev/usb/lp0`.

## Consecuencias

- La base, respaldos y `server.log` quedan en `~/.local/share/cl.almacenpos.caja/`.
- Los atajos de XFCE se quitan para **todo** el usuario: conviene un usuario dedicado a la
  caja. `--deshacer` los restaura.
- Falta probar en un equipo con Zorin OS Lite real: consumo de RAM, escáner, impresora térmica
  y que xfwm4 no reponga los atajos quitados.
- Solo x86_64. Si aparece un equipo ARM, se agrega el target `aarch64-unknown-linux-gnu`.
