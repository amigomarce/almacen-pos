import { describe, expect, it } from 'vitest';
import config, { COMPACTAR_CODIGO_ANDROID } from '../app.config.js';

/**
 * Con R8 activo el lector de códigos no funcionaba (o la app se cerraba al abrir): ver
 * `COMPACTAR_CODIGO_ANDROID` en app.config.ts.
 */
describe('lector de códigos en el APK', () => {
  it('el código Android no se compacta', () => {
    expect(COMPACTAR_CODIGO_ANDROID).toBe(false);
    const plugin = config.plugins?.find(
      (p): p is [string, { android: Record<string, unknown> }] =>
        Array.isArray(p) && p[0] === 'expo-build-properties',
    );
    expect(plugin?.[1].android).toMatchObject({
      enableMinifyInReleaseBuilds: false,
      enableShrinkResourcesInReleaseBuilds: false,
    });
    expect(plugin?.[1].android).not.toHaveProperty('extraProguardRules');
  });
});
