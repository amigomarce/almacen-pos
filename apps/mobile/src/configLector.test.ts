import { describe, expect, it } from 'vitest';
import config, { REGLAS_LECTOR_CODIGOS } from '../app.config.js';

/**
 * Sin estas reglas R8 cambia el nombre de las clases de ML Kit y `expo-camera` deja el lector
 * apagado: la cámara se ve, pero no lee el QR de la caja ni los códigos de barras.
 */
describe('lector de códigos en el APK', () => {
  it('conserva los nombres que expo-camera busca con Class.forName', () => {
    expect(REGLAS_LECTOR_CODIGOS).toContain(
      '-keep class com.google.mlkit.vision.barcode.** { *; }',
    );
    expect(REGLAS_LECTOR_CODIGOS).toContain('-keep class expo.modules.camera.** { *; }');
  });

  it('las reglas van al plugin de compilación de Android', () => {
    const plugin = config.plugins?.find(
      (p): p is [string, { android: { extraProguardRules?: string } }] =>
        Array.isArray(p) && p[0] === 'expo-build-properties',
    );
    expect(plugin?.[1].android.extraProguardRules).toBe(REGLAS_LECTOR_CODIGOS);
  });
});
