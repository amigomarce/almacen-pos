//! Envoltura de escritorio de la caja (ADR-005 y ADR-014).
//!
//! En desarrollo la interfaz usa el servidor que levanta `pnpm dev:pos:app`. En la versión
//! compilada, Tauri arranca el servidor Node como sidecar, con la base y los respaldos en el
//! directorio de datos de la app, y lo detiene al cerrar.
//!
//! La ventana funciona en modo kiosco: pantalla completa bloqueada (ver `kiosco.rs`, ADR-019).

mod kiosco;

use std::sync::Mutex;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct ServidorSidecar(Mutex<Option<CommandChild>>);

/// Archivo que existe mientras la caja está en uso y se borra solo al salir de forma limpia.
/// Si está al arrancar, la vez anterior terminó con un cierre forzado o un corte de luz.
struct MarcaEnUso(std::path::PathBuf);

/// Linux (ADR-020): WebKitGTK con el renderizador DMA-BUF deja la ventana en blanco en muchos
/// equipos con gráficos antiguos (Intel viejos, NVIDIA con driver libre). La caja no necesita
/// esa aceleración. Se respeta si el equipo ya define la variable.
#[cfg(target_os = "linux")]
fn preparar_webkit_linux() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Antes de crear cualquier hilo o ventana: todavía no hay otros hilos leyendo el entorno.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    preparar_webkit_linux();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            kiosco::salir_pantalla_completa,
            kiosco::entrar_pantalla_completa,
            kiosco::estado_pantalla_completa
        ])
        // Alt+F4, el botón de cerrar o Cmd+W no cierran la caja mientras está en pantalla
        // completa bloqueada ni mientras haya una caja abierta.
        .on_window_event(|ventana, evento| {
            if let WindowEvent::CloseRequested { api, .. } = evento {
                if !kiosco::puede_cerrarse(ventana) {
                    api.prevent_close();
                }
            }
        });
    #[cfg(target_os = "macos")]
    let builder = builder.menu(kiosco::menu_mac);

    let app = builder
        .setup(|app| {
            if let Some(ventana) = app.get_webview_window("main") {
                kiosco::preparar(&ventana)?;
            }

            // En dev el servidor lo levanta `beforeDevCommand`.
            if cfg!(debug_assertions) {
                return Ok(());
            }

            let recursos = app.path().resource_dir()?;
            let datos = app.path().app_data_dir()?;
            std::fs::create_dir_all(&datos)?;

            // Cierre inesperado de la ejecución anterior (ADR-019): el servidor lo anota en el
            // turno de caja que haya quedado abierto.
            let marca = datos.join("caja-en-uso.lock");
            let cierre_inesperado = marca.exists();
            std::fs::write(&marca, std::process::id().to_string())?;
            app.manage(MarcaEnUso(marca));

            let servidor = recursos.join("server").join("server.mjs");
            let servidor_data = recursos.join("server").join("data");
            let migraciones = recursos.join("server").join("drizzle");
            let db = datos.join("almacen.sqlite");
            let respaldos = datos.join("respaldos");
            let clave_sii = datos.join("sii.key");
            let log = datos.join("server.log");

            let puerto = std::env::var("ALMACEN_PORT").unwrap_or_else(|_| "3001".to_string());
            let mut comando = app
                .shell()
                .sidecar("almacen-node")?
                .args([servidor.to_string_lossy().to_string()])
                .env("PORT", puerto)
                .env("HOST", "127.0.0.1")
                .env("NODE_ENV", "production")
                .env("ALMACEN_PADRE_PID", std::process::id().to_string())
                .env("ALMACEN_DB", db.to_string_lossy().to_string())
                .env("ALMACEN_RESPALDOS", respaldos.to_string_lossy().to_string())
                .env("ALMACEN_SII_KEY", clave_sii.to_string_lossy().to_string())
                .env(
                    "ALMACEN_DATA_DIR",
                    servidor_data.to_string_lossy().to_string(),
                )
                .env(
                    "ALMACEN_MIGRACIONES",
                    migraciones.to_string_lossy().to_string(),
                )
                .env(
                    "ALMACEN_SEMILLA",
                    servidor_data
                        .join("out")
                        .join("seed.sqlite")
                        .to_string_lossy()
                        .to_string(),
                );

            // Valores fijados al compilar (por ejemplo, la URL de la nube del piloto).
            if let Some(url) = option_env!("ALMACEN_CLOUD_URL") {
                comando = comando.env("CLOUD_URL", url);
            }
            if let Some(contacto) = option_env!("ALMACEN_CONTACTO") {
                comando = comando.env("ALMACEN_CONTACTO", contacto);
            }
            if cierre_inesperado {
                comando = comando.env("ALMACEN_CIERRE_INESPERADO", "1");
            }

            let (mut rx, child) = comando.spawn()?;
            app.manage(ServidorSidecar(Mutex::new(Some(child))));

            // El servidor no tiene consola en Windows: su salida va a un archivo local.
            tauri::async_runtime::spawn(async move {
                use std::io::Write;
                const LIMITE_LOG: u64 = 10 * 1024 * 1024;
                let mut bytes_log = std::fs::metadata(&log).map(|m| m.len()).unwrap_or(0);
                while let Some(evento) = rx.recv().await {
                    let texto = match evento {
                        CommandEvent::Stdout(linea) | CommandEvent::Stderr(linea) => {
                            String::from_utf8_lossy(&linea).to_string()
                        }
                        CommandEvent::Error(error) => error,
                        CommandEvent::Terminated(payload) => {
                            format!("servidor terminó: {payload:?}")
                        }
                        _ => continue,
                    };
                    if bytes_log > LIMITE_LOG {
                        let anterior = log.with_file_name("server.log.1");
                        let _ = std::fs::remove_file(&anterior);
                        let _ = std::fs::rename(&log, anterior);
                        bytes_log = 0;
                    }
                    if let Ok(mut archivo) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&log)
                    {
                        let _ = writeln!(archivo, "{texto}");
                        bytes_log += texto.len() as u64 + 1;
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar la caja");

    app.run(|app, evento| {
        // Cmd+Q o el cierre de la última ventana: mismas reglas. `app.exit` (código explícito)
        // sí sale.
        if let RunEvent::ExitRequested { api, code, .. } = &evento {
            if code.is_none() && !kiosco::puede_cerrarse(app) {
                api.prevent_exit();
            }
        }
        if let RunEvent::Exit = evento {
            // Salida limpia (solo se llega aquí con la caja cerrada): fuera la marca.
            if let Some(marca) = app.try_state::<MarcaEnUso>() {
                let _ = std::fs::remove_file(&marca.0);
            }
            if let Some(estado) = app.try_state::<ServidorSidecar>() {
                if let Some(child) = estado.0.lock().expect("sidecar envenenado").take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
