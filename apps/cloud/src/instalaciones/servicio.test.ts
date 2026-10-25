import { describe, expect, it } from 'vitest';
import { vincularInstalacion, type NuevaInstalacion } from './servicio.js';
import { instalacion, repoFalso } from '../test/ayudas.js';

const datos = (sobre: Partial<NuevaInstalacion> = {}): NuevaInstalacion => ({
  id: 'inst-1',
  name: 'Caja 1',
  tokenHash: 'hash-token',
  ownerId: 'dueno-1',
  linkedAt: new Date('2026-10-25T12:00:00Z'),
  ...sobre,
});

describe('vincularInstalacion', () => {
  it('crea la instalación la primera vez', async () => {
    const repo = repoFalso();
    const r = await vincularInstalacion(repo, datos());
    expect(r).toMatchObject({ ok: true, creada: true });
    if (!r.ok) throw new Error('debía vincular');
    expect(r.instalacion).toMatchObject({ id: 'inst-1', ownerId: 'dueno-1' });
    expect(repo.filas).toHaveLength(1);
  });

  it('es idempotente para el mismo dueño (actualiza sin duplicar)', async () => {
    const repo = repoFalso();
    await vincularInstalacion(repo, datos());
    const r = await vincularInstalacion(repo, datos({ name: 'Caja 1 (nuevo nombre)' }));
    expect(r).toMatchObject({ ok: true, creada: false });
    if (!r.ok) throw new Error('debía vincular');
    expect(repo.filas).toHaveLength(1);
    expect(r.instalacion.name).toBe('Caja 1 (nuevo nombre)');
  });

  it('rechaza cambiar de dueño una caja ya vinculada', async () => {
    const repo = repoFalso();
    await vincularInstalacion(repo, datos());
    const r = await vincularInstalacion(
      repo,
      datos({ ownerId: 'dueno-2', tokenHash: 'otro-hash' }),
    );
    expect(r).toEqual({ ok: false, error: 'YA_VINCULADA' });
    expect(repo.filas).toHaveLength(1);
  });

  it('vincula una instalación preexistente sin dueño', async () => {
    const repo = repoFalso([instalacion({ id: 'inst-1', tokenHash: 'hash-viejo', ownerId: null })]);
    const r = await vincularInstalacion(repo, datos());
    expect(r).toMatchObject({ ok: true, creada: false });
    if (!r.ok) throw new Error('debía vincular');
    expect(r.instalacion).toMatchObject({ ownerId: 'dueno-1', tokenHash: 'hash-token' });
  });
});
