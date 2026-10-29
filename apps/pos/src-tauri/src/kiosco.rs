//! Modo kiosco de la caja (ADR-019). Pensado para **Windows** y **Linux**, donde corre la caja.
//!
//! La ventana abre en pantalla completa y queda **bloqueada**:
//! - Alt+F4 y el botón de cerrar no cierran la caja.
//! - WebView2 no responde a sus atajos de navegador (F5, Ctrl+R, Ctrl+F, Ctrl+P, F12, zoom…),
//!   ni muestra menú contextual: esas teclas llegan a la caja como atajos propios.
//! - La tecla Windows, Alt+Tab, Alt+Esc y Ctrl+Esc no sacan al cajero de la caja mientras está
//!   al frente.
//!
//! La **única salida** es el comando `salir_pantalla_completa`, que la interfaz ofrece solo al
//! dueño en Configuración. Ctrl+Alt+Supr no se puede bloquear (Windows lo reserva); para un
//! bloqueo total del equipo está el modo quiosco de Windows (docs/INSTALADOR.md).
//!
//! Además, **mientras haya una caja abierta la app no se cierra de ninguna forma**: ni con el
//! botón del dueño, ni con Alt+F4, ni con la ventana ya fuera de pantalla completa. Primero hay
//! que hacer el cierre de caja. El estado lo da el servidor local (`/health` → `cajaAbierta`).
//!
//! En **Linux** (Zorin OS Lite, ADR-020) la pantalla completa y el bloqueo del cierre funcionan
//! igual. WebKitGTK no trae atajos de navegador propios y la capa de `src/kiosco.ts` anula el
//! resto; la tecla Super y Alt+Tab son del gestor de ventanas (xfwm4) y se desactivan con
//! `linux/configurar-caja-linux.sh`, no desde aquí.
//!
//! En desarrollo (`pnpm dev:pos:app`) no se bloquea, salvo con `ALMACEN_KIOSCO=1`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Runtime, WebviewWindow};

/// `true` mientras la ventana está en pantalla completa bloqueada. Es global porque el hook de
/// teclado de Windows no recibe el estado de Tauri.
static BLOQUEADO: AtomicBool = AtomicBool::new(false);

pub fn bloqueado() -> bool {
    BLOQUEADO.load(Ordering::SeqCst)
}

/// Mensaje que la interfaz muestra cuando se intenta cerrar con la caja abierta.
pub const PRIMERO_CERRAR_CAJA: &str =
    "La caja está abierta. Haz el cierre de caja antes de cerrar el programa.";

/// ¿Hay un turno de caja sin cerrar? Pregunta al servidor local (sin sesión). `None` si el
/// servidor no responde: sin servidor no se puede vender, así que no hay nada que proteger.
pub fn caja_abierta() -> Option<bool> {
    let puerto = std::env::var("ALMACEN_PORT").unwrap_or_else(|_| "3001".to_string());
    let direccion: SocketAddr = format!("127.0.0.1:{puerto}").parse().ok()?;
    let mut conexion = TcpStream::connect_timeout(&direccion, Duration::from_millis(800)).ok()?;
    conexion
        .set_read_timeout(Some(Duration::from_millis(1500)))
        .ok()?;
    conexion
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut respuesta = String::new();
    conexion.read_to_string(&mut respuesta).ok()?;
    if respuesta.contains("\"cajaAbierta\":true") {
        Some(true)
    } else if respuesta.contains("\"cajaAbierta\":false") {
        Some(false)
    } else {
        None
    }
}

/// ¿Se puede cerrar la app ahora? No con la pantalla completa bloqueada ni con caja abierta.
/// Si no, avisa a la interfaz el motivo (evento `cierre-bloqueado`).
pub fn puede_cerrarse<E: Emitter<R>, R: Runtime>(emisor: &E) -> bool {
    let motivo = if caja_abierta() == Some(true) {
        Some("CAJA_ABIERTA")
    } else if bloqueado() {
        Some("PANTALLA_COMPLETA")
    } else {
        None
    };
    match motivo {
        Some(m) => {
            let _ = emisor.emit("cierre-bloqueado", m);
            false
        }
        None => true,
    }
}

/// ¿Arranca bloqueada? Siempre en la versión compilada; en dev solo si se pide.
pub fn activo_al_iniciar() -> bool {
    !cfg!(debug_assertions) || std::env::var("ALMACEN_KIOSCO").is_ok_and(|v| v == "1")
}

/// Prepara la ventana al abrir: endurece WebView2, instala el hook de teclado y, si
/// corresponde, entra en pantalla completa bloqueada.
pub fn preparar<R: Runtime>(ventana: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        windows_kiosco::endurecer_webview2(ventana);
        windows_kiosco::instalar_hook_teclado();
    }
    if activo_al_iniciar() {
        entrar(ventana)?;
    }
    Ok(())
}

/// Pone la ventana en pantalla completa y la bloquea.
pub fn entrar<R: Runtime>(ventana: &WebviewWindow<R>) -> tauri::Result<()> {
    ventana.set_fullscreen(true)?;
    BLOQUEADO.store(true, Ordering::SeqCst);
    let _ = ventana.set_focus();
    Ok(())
}

/// Única salida del modo kiosco (Configuración → Pantalla completa, solo el dueño). Con la caja
/// abierta se rechaza.
#[tauri::command]
pub fn salir_pantalla_completa<R: Runtime>(ventana: WebviewWindow<R>) -> Result<(), String> {
    if caja_abierta() == Some(true) {
        return Err(PRIMERO_CERRAR_CAJA.to_string());
    }
    BLOQUEADO.store(false, Ordering::SeqCst);
    ventana.set_fullscreen(false).map_err(|e| e.to_string())?;
    let _ = ventana.maximize();
    Ok(())
}

/// Vuelve a pantalla completa bloqueada sin reiniciar la app.
#[tauri::command]
pub fn entrar_pantalla_completa<R: Runtime>(ventana: WebviewWindow<R>) -> Result<(), String> {
    entrar(&ventana).map_err(|e| e.to_string())
}

/// Para que la interfaz sepa qué botón mostrar.
#[tauri::command]
pub fn estado_pantalla_completa() -> bool {
    bloqueado()
}

#[cfg(windows)]
mod windows_kiosco {
    use super::bloqueado;
    use tauri::{Runtime, WebviewWindow};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_LWIN, VK_RWIN, VK_TAB,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetForegroundWindow, GetWindowThreadProcessId, SetWindowsHookExW,
        HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, WH_KEYBOARD_LL,
    };

    /// WebView2 sin atajos de navegador, zoom, menú contextual, barra de estado ni (en la
    /// versión compilada) herramientas de desarrollo. La edición en los campos (Ctrl+C, Ctrl+V,
    /// Ctrl+X, Ctrl+A, Ctrl+Z) sigue funcionando.
    pub fn endurecer_webview2<R: Runtime>(ventana: &WebviewWindow<R>) {
        let _ = ventana.with_webview(|webview| unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else {
                return;
            };
            let Ok(ajustes) = core.Settings() else {
                return;
            };
            let _ = ajustes.SetIsZoomControlEnabled(false);
            let _ = ajustes.SetAreDefaultContextMenusEnabled(false);
            let _ = ajustes.SetIsStatusBarEnabled(false);
            if !cfg!(debug_assertions) {
                let _ = ajustes.SetAreDevToolsEnabled(false);
            }
            if let Ok(ajustes3) = ajustes.cast::<ICoreWebView2Settings3>() {
                let _ = ajustes3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        });
    }

    /// ¿La ventana de adelante es de la caja?
    fn caja_al_frente() -> bool {
        unsafe {
            let ventana = GetForegroundWindow();
            let mut pid = 0u32;
            GetWindowThreadProcessId(ventana, Some(&mut pid));
            pid == GetCurrentProcessId()
        }
    }

    /// Hook global de teclado de bajo nivel: solo actúa con la caja bloqueada y al frente.
    unsafe extern "system" fn al_teclear(codigo: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if codigo == HC_ACTION as i32 && bloqueado() && caja_al_frente() {
            let tecla = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
            let vk = tecla.vkCode as u16;
            let alt = tecla.flags.0 & LLKHF_ALTDOWN.0 != 0;
            let ctrl = unsafe { GetAsyncKeyState(VK_CONTROL.0 as i32) } < 0;
            // Ctrl+Esc y Ctrl+Mayús+Esc (Administrador de tareas) entran en `ctrl && Esc`.
            let anular = vk == VK_LWIN.0
                || vk == VK_RWIN.0
                || (alt && (vk == VK_TAB.0 || vk == VK_ESCAPE.0))
                || (ctrl && vk == VK_ESCAPE.0);
            if anular {
                return LRESULT(1);
            }
        }
        unsafe { CallNextHookEx(None, codigo, wparam, lparam) }
    }

    /// Se instala una vez en el hilo principal (el de la ventana, que tiene bucle de mensajes).
    pub fn instalar_hook_teclado() {
        unsafe {
            let _ = SetWindowsHookExW(WH_KEYBOARD_LL, Some(al_teclear), None, 0);
        }
    }
}

/// macOS (solo desarrollo): menú mínimo con "Editar" para copiar y pegar. Sin "Salir",
/// "Cerrar", "Ocultar", "Minimizar" ni "Pantalla completa", así Cmd+Q, Cmd+W, Cmd+H, Cmd+M y
/// Cmd+Ctrl+F no hacen nada.
#[cfg(target_os = "macos")]
pub fn menu_mac<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
    let aplicacion = Submenu::with_items(app, "Almacén POS", true, &[])?;
    let editar = Submenu::with_items(
        app,
        "Editar",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&aplicacion, &editar])
}

#[cfg(test)]
mod tests {
    use super::caja_abierta;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Servidor de una sola respuesta que imita `/health`.
    fn servidor(cuerpo: &'static str) -> u16 {
        let escucha = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = escucha.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = escucha.accept().unwrap();
            let mut buf = [0u8; 512];
            let _ = s.read(&mut buf);
            let r = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                cuerpo.len(),
                cuerpo
            );
            let _ = s.write_all(r.as_bytes());
        });
        puerto
    }

    #[test]
    fn lee_caja_abierta_del_servidor_local() {
        // Un solo test que cambia ALMACEN_PORT, para no pisarse con otros en paralelo.
        let casos = [
            (r#"{"status":"ok","cajaAbierta":true}"#, Some(true)),
            (r#"{"status":"ok","cajaAbierta":false}"#, Some(false)),
            (r#"{"status":"ok"}"#, None),
        ];
        for (cuerpo, esperado) in casos {
            let puerto = servidor(cuerpo);
            std::env::set_var("ALMACEN_PORT", puerto.to_string());
            assert_eq!(caja_abierta(), esperado, "{cuerpo}");
        }
        // Sin servidor: no hay nada que proteger.
        let libre = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        std::env::set_var("ALMACEN_PORT", libre.to_string());
        assert_eq!(caja_abierta(), None);
    }
}
