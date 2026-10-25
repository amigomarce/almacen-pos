//! Envoltura de escritorio de la caja (ADR-005): solo abre la ventana con la interfaz.
//! Toda la lógica vive en el servidor local (apps/server) y en la interfaz web (apps/pos).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar la caja");
}
