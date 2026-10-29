# ADR-019: Caja en pantalla completa bloqueada y sin cierre con la caja abierta

- Fecha: 2026-10-29
- Estado: **Aprobado** (2026-10-29)
- Base: ADR-005 (Tauri como envoltura), ADR-014 (sidecar). Linux: ADR-020.

## Contexto

El dueño pidió tres cosas para la app de caja, cuya plataforma principal es **Windows**:

1. Que funcione siempre en **pantalla completa**.
2. Que se salga de ese modo de **una sola manera**, para que **todas las teclas** queden como
   atajos de la caja (F2, F4, F12, Esc… y los que vengan), sin que el navegador embebido o el
   sistema las use para recargar, buscar, imprimir o cambiar de programa.
3. Que la app **no se pueda cerrar ni forzar su cierre mientras haya una caja abierta**: primero
   el cierre de caja, después cualquier tipo de salida.

Límite duro: en Windows ninguna app puede impedir **Ctrl+Alt+Supr**, el **Finalizar tarea** del
Administrador de tareas ni un **corte de luz**. En Linux pasa lo mismo con cambiar de consola
(Ctrl+Alt+F1–F7) o con `kill`.

## Opciones consideradas

1. Solo pantalla completa de Tauri. Deja activos F5, Ctrl+P, Alt+F4, la tecla Windows y
   Alt+Tab.
2. **Bloqueo por capas en la app** (elegida), más una guía para el sistema operativo.
3. Que la app cambie la seguridad de Windows (por ejemplo, desactivar el Administrador de
   tareas por directiva). Se descartó: afecta al equipo completo y al dueño. Queda como paso
   manual en la guía.

## Decisión

**Pantalla completa bloqueada** (`apps/pos/src-tauri/src/kiosco.rs`). Siempre en la versión
compilada; en desarrollo, solo con `ALMACEN_KIOSCO=1`.

- **WebView2 (Windows)**: sin atajos de navegador (`SetAreBrowserAcceleratorKeysEnabled(false)`:
  F5, Ctrl+R, Ctrl+F, Ctrl+P, F12, Ctrl+Mayús+I…), zoom, menú contextual, barra de estado ni
  herramientas de desarrollo. La edición en los campos (Ctrl+C/V/X/A/Z) sigue funcionando.
- **Hook de teclado (Windows)**: con la caja bloqueada y al frente, anula la tecla Windows,
  Alt+Tab, Alt+Esc, Ctrl+Esc y Ctrl+Mayús+Esc.
- **Interfaz** (`apps/pos/src/kiosco.ts`, segunda capa y la única en macOS/Linux): anula en
  captura F1–F24, Ctrl/Cmd+tecla (salvo edición), Alt+←/→ y teclas multimedia; el menú
  contextual fuera de los campos y el zoom con Ctrl+rueda. Solo cancela la acción del
  navegador: los oyentes de la caja igual reciben la tecla. AltGr (Ctrl+Alt) queda libre para
  escribir @, # o [.
- **macOS (desarrollo)**: menú mínimo sin Salir/Cerrar/Ocultar/Pantalla completa.

**Única salida**: Configuración → **Pantalla completa** → *Salir de pantalla completa*. Solo el
dueño ve Configuración. Desde ahí también se vuelve a pantalla completa, y al reabrir la app
parte bloqueada.

**Sin cierre con la caja abierta**:

- El servidor local informa `cajaAbierta` en `/health` (público y local). Con la base caída
  informa `false`, para poder reiniciar la caja.
- Tauri lo consulta antes de cualquier cierre: el botón de la ventana, Alt+F4 o Cmd+W
  (`CloseRequested`), Cmd+Q o el cierre de la última ventana (`ExitRequested`) y el botón del
  dueño (`salir_pantalla_completa`). Si hay caja abierta, o si la pantalla completa está
  bloqueada, no cierra y emite `cierre-bloqueado`. La caja muestra "La caja está abierta. Haz el
  cierre de caja antes de cerrar el programa." En Configuración el botón queda deshabilitado
  con la caja abierta.
- Si el servidor no responde se permite cerrar: sin servidor no se puede vender.

**Cierres inesperados**: lo que la app no puede impedir queda **registrado**. La app deja la
marca `caja-en-uso.lock` en su carpeta de datos y la borra solo al salir de forma limpia. Si al
arrancar sigue ahí, avisa al servidor (`ALMACEN_CIERRE_INESPERADO=1`) y este anota el evento en
cada turno abierto (tabla `unexpected_shutdowns`, migración 0009). El dueño lo ve en Caja y en
el resumen del cierre: "La caja se cerró sin hacer el cierre de caja (cierre forzado o corte de
luz) N veces…". Nada se borra.

## Consecuencias

- Para un bloqueo total del equipo hace falta configurar el sistema: en Windows, una cuenta de
  cajero sin Administrador de tareas o con Acceso asignado (guía en `docs/INSTALADOR.md`); en
  Linux, `configurar-caja-linux.sh` (ADR-020).
- El hook de teclado es global, pero solo actúa con la caja bloqueada y al frente. Algunos
  antivirus podrían mirarlo con sospecha: vigilar en las primeras instalaciones.
- La consulta a `/health` al cerrar agrega hasta ~2 s si el servidor tarda en responder.
- Falta la prueba manual en un PC Windows real (Alt+F4, tecla Windows, Alt+Tab, F5, Ctrl+P y
  el registro tras *Finalizar tarea*). El código de Windows se verificó con `cargo check` y
  `clippy` para `x86_64-pc-windows-msvc` y lo compila el workflow del instalador.
