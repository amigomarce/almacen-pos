import { describe, expect, it } from 'vitest';
import type { AlmacenObjetos } from './almacen.js';
import { guardarRespaldo, sha256De, type RepoRespaldos, type RespaldoCloud } from './servicio.js';

function repoFalso(): { repo: RepoRespaldos; filas: RespaldoCloud[] } {
  const filas: RespaldoCloud[] = [];
  const repo: RepoRespaldos = {
    guardar(datos) {
      const fila: RespaldoCloud = { ...datos };
      filas.push(fila);
      return Promise.resolve(fila);
    },
    listar(ownerId, installationId, limite = 50) {
      return Promise.resolve(
        filas
          .filter((f) => f.ownerId === ownerId && f.installationId === installationId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limite),
      );
    },
    porId(ownerId, installationId, id) {
      return Promise.resolve(
        filas.find(
          (f) => f.ownerId === ownerId && f.installationId === installationId && f.id === id,
        ) ?? null,
      );
    },
    antiguos(ownerId, installationId, conservar) {
      return Promise.resolve(
        filas
          .filter((f) => f.ownerId === ownerId && f.installationId === installationId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(conservar),
      );
    },
    eliminar(id) {
      const i = filas.findIndex((f) => f.id === id);
      if (i >= 0) filas.splice(i, 1);
      return Promise.resolve();
    },
  };
  return { repo, filas };
}

function almacenFalso(): { almacen: AlmacenObjetos; objetos: Map<string, Buffer> } {
  const objetos = new Map<string, Buffer>();
  return {
    objetos,
    almacen: {
      subir(ruta, datos) {
        objetos.set(ruta, Buffer.from(datos));
        return Promise.resolve();
      },
      descargar(ruta) {
        const d = objetos.get(ruta);
        return d ? Promise.resolve(d) : Promise.reject(new Error('no existe'));
      },
      eliminar(ruta) {
        objetos.delete(ruta);
        return Promise.resolve();
      },
    },
  };
}

const DATOS = {
  ownerId: 'dueno-1',
  installationId: 'inst-1',
  filename: 'almacen-2026-10-26_00-00-00.apos',
  sizeBytes: 3,
  sha256: sha256De(Buffer.from('abc')),
  datos: Buffer.from('abc'),
  createdAt: new Date('2026-10-26T03:00:00Z'),
  retention: 2,
};

describe('guardarRespaldo', () => {
  it('sube, registra y poda los respaldos que sobran', async () => {
    const { repo, filas } = repoFalso();
    const { almacen, objetos } = almacenFalso();
    const uno = await guardarRespaldo(repo, almacen, DATOS);
    expect(uno.objectKey).toBe(`dueno-1/inst-1/${uno.id}.apos`);
    expect(objetos.size).toBe(1);

    await guardarRespaldo(repo, almacen, {
      ...DATOS,
      createdAt: new Date('2026-10-26T04:00:00Z'),
    });
    await guardarRespaldo(repo, almacen, {
      ...DATOS,
      createdAt: new Date('2026-10-26T05:00:00Z'),
    });
    expect(filas).toHaveLength(2);
    expect(objetos.size).toBe(2);
    expect(objetos.has(uno.objectKey)).toBe(false);
  });

  it('rechaza nombre, tamaño o retención inválidos sin subir', async () => {
    const { repo } = repoFalso();
    const { almacen, objetos } = almacenFalso();
    await expect(
      guardarRespaldo(repo, almacen, { ...DATOS, filename: '../x.apos' }),
    ).rejects.toMatchObject({ codigo: 'RESPALDO_NOMBRE_INVALIDO' });
    await expect(guardarRespaldo(repo, almacen, { ...DATOS, sizeBytes: 0 })).rejects.toMatchObject({
      codigo: 'RESPALDO_VACIO',
    });
    await expect(guardarRespaldo(repo, almacen, { ...DATOS, retention: 0 })).rejects.toMatchObject({
      codigo: 'RESPALDO_RETENCION_INVALIDA',
    });
    expect(objetos.size).toBe(0);
  });

  it('borra el objeto si falla el registro en Postgres', async () => {
    const { almacen, objetos } = almacenFalso();
    const repo: RepoRespaldos = {
      ...repoFalso().repo,
      guardar() {
        return Promise.reject(new Error('db caída'));
      },
    };
    await expect(guardarRespaldo(repo, almacen, DATOS)).rejects.toThrow('db caída');
    expect(objetos.size).toBe(0);
  });

  it('no registra si falla la subida a Storage', async () => {
    const { repo, filas } = repoFalso();
    const almacen: AlmacenObjetos = {
      subir() {
        return Promise.reject(new Error('storage caído'));
      },
      descargar() {
        return Promise.reject(new Error('no'));
      },
      eliminar() {
        return Promise.resolve();
      },
    };
    await expect(guardarRespaldo(repo, almacen, DATOS)).rejects.toThrow('storage caído');
    expect(filas).toHaveLength(0);
  });
});
