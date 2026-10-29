import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crearPantallaCompleta,
  escucharCierreBloqueado,
  debeBloquearTecla,
  esAppEscritorio,
  instalarBloqueoDeTeclas,
  type Tecla,
} from './kiosco.js';

const tecla = (key: string, mods: Partial<Omit<Tecla, 'key'>> = {}): Tecla => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('debeBloquearTecla', () => {
  it.each(['F1', 'F2', 'F3', 'F4', 'F5', 'F7', 'F11', 'F12', 'F24'])(
    'anula la acción del navegador para %s',
    (k) => {
      expect(debeBloquearTecla(tecla(k))).toBe(true);
    },
  );

  it.each(['r', 'f', 'p', 's', 'o', 'n', 'w', 't', 'g', 'h', 'j', 'u', '+', '-', '0', 'R'])(
    'anula Ctrl+%s (recargar, buscar, imprimir, zoom…)',
    (k) => {
      expect(debeBloquearTecla(tecla(k, { ctrlKey: true }))).toBe(true);
      expect(debeBloquearTecla(tecla(k, { metaKey: true }))).toBe(true);
    },
  );

  it.each(['a', 'c', 'v', 'x', 'z', 'y', 'C', 'V'])('deja Ctrl+%s para editar campos', (k) => {
    expect(debeBloquearTecla(tecla(k, { ctrlKey: true }))).toBe(false);
  });

  it('deja AltGr (Ctrl+Alt) para escribir @, # y [', () => {
    expect(debeBloquearTecla(tecla('@', { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('anula atrás/adelante del historial y las teclas multimedia', () => {
    expect(debeBloquearTecla(tecla('ArrowLeft', { altKey: true }))).toBe(true);
    expect(debeBloquearTecla(tecla('ArrowRight', { altKey: true }))).toBe(true);
    expect(debeBloquearTecla(tecla('Home', { altKey: true }))).toBe(true);
    expect(debeBloquearTecla(tecla('BrowserBack'))).toBe(true);
    expect(debeBloquearTecla(tecla('BrowserRefresh'))).toBe(true);
  });

  it.each(['Escape', 'Enter', 'Backspace', 'Tab', 'ArrowLeft', '7', 'a', ' '])(
    'no toca las teclas normales de la caja (%s)',
    (k) => {
      expect(debeBloquearTecla(tecla(k))).toBe(false);
    },
  );
});

describe('instalarBloqueoDeTeclas', () => {
  let quitar: (() => void) | null = null;
  afterEach(() => {
    quitar?.();
    quitar = null;
    document.body.innerHTML = '';
  });

  const presionar = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...mods });
    window.dispatchEvent(e);
    return e;
  };

  it('anula F5 y Ctrl+R pero la caja igual recibe F12', () => {
    quitar = instalarBloqueoDeTeclas();
    const recibidas: string[] = [];
    const oyente = (e: KeyboardEvent) => recibidas.push(e.key);
    window.addEventListener('keydown', oyente);

    expect(presionar('F5').defaultPrevented).toBe(true);
    expect(presionar('r', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(presionar('F12').defaultPrevented).toBe(true);
    expect(presionar('c', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(presionar('Escape').defaultPrevented).toBe(false);
    expect(recibidas).toEqual(['F5', 'r', 'F12', 'c', 'Escape']);
    window.removeEventListener('keydown', oyente);
  });

  it('anula el menú contextual fuera de los campos y el zoom con Ctrl+rueda', () => {
    quitar = instalarBloqueoDeTeclas();
    const campo = document.createElement('input');
    document.body.append(campo);

    const enFondo = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(enFondo);
    expect(enFondo.defaultPrevented).toBe(true);

    const enCampo = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    campo.dispatchEvent(enCampo);
    expect(enCampo.defaultPrevented).toBe(false);

    const zoom = new WheelEvent('wheel', { ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    const scroll = new WheelEvent('wheel', { cancelable: true, bubbles: true });
    window.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it('se puede quitar', () => {
    instalarBloqueoDeTeclas()();
    expect(presionar('F5').defaultPrevented).toBe(false);
  });
});

describe('pantalla completa', () => {
  it('detecta la app de escritorio por Tauri', () => {
    expect(esAppEscritorio()).toBe(false);
    expect(esAppEscritorio({ __TAURI_INTERNALS__: {} } as unknown as Window)).toBe(true);
  });

  it('llama a los comandos de Tauri', async () => {
    const invocar = vi.fn((c: string) => Promise.resolve(c === 'estado_pantalla_completa'));
    const p = crearPantallaCompleta(invocar, true);
    expect(await p.activa()).toBe(true);
    await p.salir();
    await p.entrar();
    expect(invocar.mock.calls.map((c) => c[0])).toEqual([
      'estado_pantalla_completa',
      'salir_pantalla_completa',
      'entrar_pantalla_completa',
    ]);
  });

  it('en el navegador no hace nada', async () => {
    const invocar = vi.fn(() => Promise.resolve(true));
    const p = crearPantallaCompleta(invocar, false);
    expect(p.disponible).toBe(false);
    expect(await p.activa()).toBe(false);
    await p.salir();
    await p.entrar();
    expect(invocar).not.toHaveBeenCalled();
  });
});

describe('cierre bloqueado', () => {
  it('avisa el motivo cuando Tauri rechaza el cierre', async () => {
    let alRecibir: ((e: { payload: unknown }) => void) | null = null;
    const quitarOyente = vi.fn();
    const escuchar = vi.fn((_: string, cb: (e: { payload: unknown }) => void) => {
      alRecibir = cb;
      return Promise.resolve(quitarOyente);
    });
    const motivos: string[] = [];
    const quitar = escucharCierreBloqueado((m) => motivos.push(m), escuchar, true);
    await Promise.resolve();
    expect(escuchar).toHaveBeenCalledWith('cierre-bloqueado', expect.any(Function));
    const enviar = alRecibir as ((e: { payload: unknown }) => void) | null;
    if (!enviar) throw new Error('no se registró el oyente');
    enviar({ payload: 'CAJA_ABIERTA' });
    enviar({ payload: 'OTRA_COSA' });
    enviar({ payload: 'PANTALLA_COMPLETA' });
    expect(motivos).toEqual(['CAJA_ABIERTA', 'PANTALLA_COMPLETA']);
    quitar();
    expect(quitarOyente).toHaveBeenCalled();
  });

  it('en el navegador no escucha', () => {
    const escuchar = vi.fn();
    escucharCierreBloqueado(() => undefined, escuchar, false)();
    expect(escuchar).not.toHaveBeenCalled();
  });
});
