import { describe, expect, it } from 'vitest';
import { parsearQrVinculacion } from './vinculacion.js';

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
