import { describe, expect, it } from 'vitest';
import { INACTIVIDAD_MAX_MS, Sesiones } from './sesiones.js';

const ana = { id: 'u1', name: 'Ana', role: 'CAJERO' as const };
const beto = { id: 'u2', name: 'Beto', role: 'DUENO' as const };

describe('Sesiones', () => {
  it('crea tokens únicos y largos, y los recupera', () => {
    const s = new Sesiones();
    const a = s.crear(ana);
    const b = s.crear(ana);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(s.obtener(a.token)?.usuario).toEqual(ana);
    expect(s.obtener('otro')).toBeNull();
  });

  it('vence por inactividad y renueva con cada uso', () => {
    let t = 0;
    const s = new Sesiones(() => t);
    const { token } = s.crear(ana);
    t = INACTIVIDAD_MAX_MS; // justo en el límite: sigue vigente y se renueva
    expect(s.obtener(token)).not.toBeNull();
    t += INACTIVIDAD_MAX_MS;
    expect(s.obtener(token)).not.toBeNull();
    t += INACTIVIDAD_MAX_MS + 1;
    expect(s.obtener(token)).toBeNull();
    expect(s.obtener(token)).toBeNull();
  });

  it('cierra una sesión o todas las de un usuario', () => {
    const s = new Sesiones();
    const a1 = s.crear(ana);
    const a2 = s.crear(ana);
    const b = s.crear(beto);
    s.cerrar(a1.token);
    expect(s.obtener(a1.token)).toBeNull();
    expect(s.obtener(a2.token)).not.toBeNull();
    s.cerrarDeUsuario('u1');
    expect(s.obtener(a2.token)).toBeNull();
    expect(s.obtener(b.token)).not.toBeNull();
  });
});
