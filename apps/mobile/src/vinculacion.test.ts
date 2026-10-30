import { describe, expect, it } from 'vitest';
import { parsearQrVinculacion, vincularDesdeQr } from './vinculacion.js';

describe('parsearQrVinculacion', () => {
  it('lee el QR de la caja y decodifica los parámetros', () => {
    expect(
      parsearQrVinculacion(
        'almacenpos://vincular?instalacion=inst-1&token=tok%2B1&caja=Caja%20Uno',
      ),
    ).toEqual({ installationId: 'inst-1', deviceToken: 'tok+1', caja: 'Caja Uno' });
  });

  it('usa "Caja 1" si el QR no trae nombre', () => {
    expect(parsearQrVinculacion('almacenpos://vincular?instalacion=inst-1&token=tok')?.caja).toBe(
      'Caja 1',
    );
  });

  it('rechaza otros códigos o datos incompletos', () => {
    expect(parsearQrVinculacion('https://ejemplo.cl')).toBeNull();
    expect(parsearQrVinculacion('almacenpos://vincular?instalacion=inst-1')).toBeNull();
    expect(parsearQrVinculacion('almacenpos://vincular?token=tok')).toBeNull();
    expect(parsearQrVinculacion('almacenpos://vincular?instalacion=%ZZ&token=tok')).toBeNull();
  });
});

describe('vincularDesdeQr', () => {
  const qr = 'almacenpos://vincular?instalacion=inst-1&token=tok&caja=Caja%20Uno';

  it('con el QR de la caja vincula de inmediato', async () => {
    const llamadas: string[][] = [];
    const r = await vincularDesdeQr(qr, (i, t, n) => {
      llamadas.push([i, t, n]);
      return Promise.resolve({ name: n });
    });
    expect(r).toEqual({ tipo: 'VINCULADA', nombre: 'Caja Uno' });
    expect(llamadas).toEqual([['inst-1', 'tok', 'Caja Uno']]);
  });

  it('otro código no intenta vincular', async () => {
    let llamado = false;
    const r = await vincularDesdeQr('https://ejemplo.cl', () => {
      llamado = true;
      return Promise.resolve({ name: 'x' });
    });
    expect(r).toEqual({ tipo: 'NO_ES_CAJA' });
    expect(llamado).toBe(false);
  });

  it('si la nube rechaza, devuelve el error y los datos leídos', async () => {
    const r = await vincularDesdeQr(qr, () => Promise.reject(new Error('Token inválido')));
    expect(r).toEqual({
      tipo: 'ERROR',
      mensaje: 'Token inválido',
      datos: { installationId: 'inst-1', deviceToken: 'tok', caja: 'Caja Uno' },
    });
  });
});
