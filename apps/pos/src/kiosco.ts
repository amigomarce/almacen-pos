/**
 * Modo kiosco de la caja (ADR-019). En Windows, WebView2 ya viene sin atajos de navegador
 * (`src-tauri/src/kiosco.rs`); este bloqueo es la segunda capa, y la única en el WebView de
 * macOS (desarrollo). Anula recargar, buscar, imprimir, zoom, atrás/adelante y herramientas de
 * desarrollo, para que todas las teclas queden libres para los atajos de la caja.
 *
 * `preventDefault` solo cancela la acción del navegador: los oyentes de la caja (F2, F4, F12,
 * Esc…) igual reciben la tecla.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Lo mínimo de un evento de teclado que hace falta para decidir. */
export interface Tecla {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Edición de texto en los campos: siempre permitida (copiar, pegar, cortar, deshacer…). */
const EDICION = new Set(['a', 'c', 'v', 'x', 'z', 'y']);

/** Teclas multimedia del navegador. */
const NAVEGADOR = new Set([
  'BrowserBack',
  'BrowserForward',
  'BrowserRefresh',
  'BrowserSearch',
  'BrowserHome',
  'BrowserFavorites',
  'BrowserStop',
]);

/** ¿Hay que anular la acción del navegador para esta tecla? */
export function debeBloquearTecla(t: Tecla): boolean {
  if (NAVEGADOR.has(t.key)) return true;
  // F1–F24: recargar (F5), buscar (F3), pantalla completa (F11), herramientas (F12)…
  if (/^F([1-9]|1\d|2[0-4])$/.test(t.key)) return true;
  // AltGr en teclados en español llega como Ctrl+Alt: sirve para escribir @, #, [, etc.
  if (t.ctrlKey && t.altKey) return false;
  if (t.ctrlKey || t.metaKey) return !EDICION.has(t.key.toLowerCase());
  // Alt+← / Alt+→ / Alt+Inicio: navegación del historial.
  return t.altKey && (t.key === 'ArrowLeft' || t.key === 'ArrowRight' || t.key === 'Home');
}

const esEditable = (objetivo: EventTarget | null) =>
  objetivo instanceof HTMLElement &&
  (objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName));

/**
 * Instala el bloqueo en la ventana (fase de captura, antes que la caja). Además anula el menú
 * contextual fuera de los campos y el zoom con Ctrl+rueda. Devuelve cómo quitarlo.
 */
export function instalarBloqueoDeTeclas(ventana: Window = window): () => void {
  const alTeclear = (e: KeyboardEvent) => {
    if (debeBloquearTecla(e)) e.preventDefault();
  };
  const alMenu = (e: MouseEvent) => {
    if (!esEditable(e.target)) e.preventDefault();
  };
  const alRueda = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  ventana.addEventListener('keydown', alTeclear, { capture: true });
  ventana.addEventListener('contextmenu', alMenu, { capture: true });
  ventana.addEventListener('wheel', alRueda, { capture: true, passive: false });
  return () => {
    ventana.removeEventListener('keydown', alTeclear, { capture: true });
    ventana.removeEventListener('contextmenu', alMenu, { capture: true });
    ventana.removeEventListener('wheel', alRueda, { capture: true });
  };
}

/** ¿Corre dentro de la app de escritorio (Tauri) y no en un navegador? */
export function esAppEscritorio(ventana: Window = window): boolean {
  return '__TAURI_INTERNALS__' in ventana;
}

type Invocar = (comando: string) => Promise<unknown>;

/** Control de la pantalla completa bloqueada (comandos de `src-tauri/src/kiosco.rs`). */
export interface PantallaCompleta {
  /** `false` en el navegador: ahí no hay pantalla completa que controlar. */
  disponible: boolean;
  activa(): Promise<boolean>;
  salir(): Promise<void>;
  entrar(): Promise<void>;
}

export function crearPantallaCompleta(
  invocar: Invocar = (c) => invoke(c),
  disponible = esAppEscritorio(),
): PantallaCompleta {
  return {
    disponible,
    async activa() {
      return disponible ? Boolean(await invocar('estado_pantalla_completa')) : false;
    },
    async salir() {
      if (disponible) await invocar('salir_pantalla_completa');
    },
    async entrar() {
      if (disponible) await invocar('entrar_pantalla_completa');
    },
  };
}

/** Por qué la app no se dejó cerrar (evento `cierre-bloqueado` de `kiosco.rs`). */
export type MotivoCierreBloqueado = 'CAJA_ABIERTA' | 'PANTALLA_COMPLETA';

export const MENSAJE_CIERRE_BLOQUEADO: Record<MotivoCierreBloqueado, string> = {
  CAJA_ABIERTA: 'La caja está abierta. Haz el cierre de caja antes de cerrar el programa.',
  PANTALLA_COMPLETA:
    'La caja está en pantalla completa. Para salir, el dueño debe ir a Configuración → Pantalla completa.',
};

type Escuchar = (
  evento: string,
  alRecibir: (e: { payload: unknown }) => void,
) => Promise<() => void>;

/**
 * Avisa cuando alguien intenta cerrar la app (Alt+F4, botón de cerrar) y no se puede. Devuelve
 * cómo dejar de escuchar. En el navegador no hace nada.
 */
export function escucharCierreBloqueado(
  alBloquear: (motivo: MotivoCierreBloqueado) => void,
  escuchar: Escuchar = (evento, cb) => listen(evento, cb),
  disponible = esAppEscritorio(),
): () => void {
  if (!disponible) return () => undefined;
  let quitar: (() => void) | null = null;
  let activo = true;
  void escuchar('cierre-bloqueado', (e) => {
    if (e.payload === 'CAJA_ABIERTA' || e.payload === 'PANTALLA_COMPLETA') alBloquear(e.payload);
  }).then((q) => {
    if (activo) quitar = q;
    else q();
  });
  return () => {
    activo = false;
    quitar?.();
  };
}
