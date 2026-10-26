import type { ExpoConfig } from 'expo/config';

/**
 * Configuración de la app del dueño. Es TypeScript (no app.json) para que el perfil de EAS
 * decida si se acepta `http://`:
 * - `preview` (APK para instalar directo) y desarrollo: sí, para probar con la nube en la red
 *   local (`http://192.168.x.x:3002`).
 * - `production` (Play Store / TestFlight): no; la nube tiene que estar en `https://`.
 *
 * La URL de la nube y Supabase se inyectan al compilar desde las variables de entorno de EAS
 * (`EXPO_PUBLIC_*`, ver docs/APP_DUENO.md); no se versionan.
 */
const entorno = process.env as Record<string, string | undefined>;
const perfil = entorno['EAS_BUILD_PROFILE'] ?? 'development';
const permitirHttp = perfil !== 'production';

/** Proyecto @amigomarce/almacen-dueno en expo.dev (lo entregó `eas init`). */
const EAS_PROJECT_ID = '1fe8ed33-1ffd-46d4-a431-a58d286e4d69';

const config: ExpoConfig = {
  name: 'Almacén Dueño',
  slug: 'almacen-dueno',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icono.png',
  ios: {
    bundleIdentifier: 'cl.almacenpos.dueno',
    supportsTablet: true,
    infoPlist: {
      // Solo usa HTTPS estándar: exenta de la declaración de cifrado de exportación.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'cl.almacenpos.dueno',
    adaptiveIcon: {
      foregroundImage: './assets/icono-adaptativo.png',
      backgroundColor: '#0b6bcb',
    },
  },
  plugins: [
    ['expo-camera', { cameraPermission: 'Escanear códigos de barras de productos' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: permitirHttp } }],
  ],
  extra: { eas: { projectId: EAS_PROJECT_ID } },
};

export default config;
