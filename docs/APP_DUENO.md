# App del dueño: builds instalables (EAS)

La app del dueño (`apps/mobile`, Expo) se compila con **EAS Build**, el servicio de Expo, sin
Android Studio ni Xcode en el Mac. Hay dos perfiles (`apps/mobile/eas.json`):

| Perfil | Para qué | Salida | ¿Acepta `http://`? |
|---|---|---|---|
| `preview` | Instalar directo en Android, sin tienda | `.apk` | Sí (nube en la red local) |
| `production` | TestFlight / App Store y Play Store | `.ipa` / `.aab` | No: la nube debe ir en `https://` |

La URL de la nube y los datos de Supabase **no se versionan**: se leen al compilar desde las
variables de entorno de EAS (`EXPO_PUBLIC_*`), una por perfil. La anon key de Supabase es
pública por diseño (los permisos los da nuestra API), pero igual queda fuera del repo.

## Cuentas (las crea el dueño del proyecto)

- **Expo** (gratis): <https://expo.dev/signup>. Necesaria para todo.
- **Apple Developer** (US$ 99/año): solo para iPhone, incluso para TestFlight.
- **Google Play Console** (US$ 25, pago único): solo si se publica en Play Store. El APK de
  `preview` no la necesita.

## Una sola vez: vincular el proyecto

```bash
cd apps/mobile
npx eas-cli login          # con tu cuenta de Expo
npx eas-cli init           # crea el proyecto "almacen-dueno" en expo.dev
```

`eas init` muestra el **project ID**. Como la configuración es `app.config.ts`, cópialo a mano
en la constante `EAS_PROJECT_ID` de `apps/mobile/app.config.ts` y haz commit.

## Android: APK para instalar directo

### 1. La nube que usará el teléfono

- **Uso real (configurado):** `https://almacen-pos-nube.fly.dev`, publicada en Fly.io y
  siempre encendida ([`NUBE.md`](NUBE.md)). Es la que usa el perfil `preview` hoy. Con ella la
  app funciona desde cualquier red.
- **Solo para pruebas en la red local:** levanta la nube escuchando en la red y usa la IP del Mac:
  ```bash
  CLOUD_HOST=0.0.0.0 pnpm dev:cloud     # puerto 3002
  ipconfig getifaddr en0                # IP del Mac, p. ej. 192.168.1.20
  ```
  La URL queda `http://192.168.1.20:3002`. Solo funciona con el teléfono en la misma Wi-Fi y
  el Mac encendido; si el router cambia la IP del Mac hay que recompilar.

### 2. Variables del perfil `preview`

```bash
cd apps/mobile
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_CLOUD_URL --value https://almacen-pos-nube.fly.dev --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<proyecto>.supabase.co --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility sensitive
```

(Los mismos valores que tienes en `apps/mobile/.env`.) Para cambiar uno: `eas env:update`.

### 3. Compilar e instalar

```bash
cd apps/mobile
npx eas-cli build --platform android --profile preview
```

La primera vez pregunta si genera el keystore de Android: responde que sí (EAS lo guarda; no
lo pierdas, firma todas las versiones). Al terminar (~10–15 min) entrega un enlace y un QR:
ábrelo en el teléfono Android, descarga el `.apk` e instálalo (Android pide permitir
"instalar apps de fuentes desconocidas" para el navegador).

Después, en la app: inicia sesión con la cuenta de Supabase del dueño y vincula la caja con el
QR de **Configuración → Primera configuración**.

## iPhone: TestFlight

Requisitos: cuenta Apple Developer. La nube ya está en `https://` (iOS bloquea `http://` en
apps distribuidas).

```bash
cd apps/mobile
# Variables del perfil production (URL https)
npx eas-cli env:create --environment production --name EXPO_PUBLIC_CLOUD_URL --value https://almacen-pos-nube.fly.dev --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<proyecto>.supabase.co --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility sensitive

npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

`eas build` pide iniciar sesión con la cuenta de Apple y crea los certificados. `eas submit`
sube el build a App Store Connect; en ~15–30 min aparece en **TestFlight**, donde agregas a
los probadores (correo) y ellos instalan con la app TestFlight.

El mismo perfil `production` sirve para Play Store: `eas build --platform android --profile
production` genera el `.aab` y `eas submit --platform android` lo sube.

## Qué está configurado en el repo

- `app.config.ts`: nombre "Almacén Dueño", `cl.almacenpos.dueno` en iOS y Android, íconos,
  permiso de cámara, modo claro (`expo-system-ui`), `usesCleartextTraffic` solo fuera de
  `production` (`expo-build-properties`) y `ITSAppUsesNonExemptEncryption: false` (evita la
  pregunta de cifrado de exportación en cada build de TestFlight).
- **Lector de códigos en el APK:** Expo compacta el APK con R8
  (`android.enableMinifyInReleaseBuilds=true`) y eso cambiaba el nombre de las clases de ML Kit.
  `expo-camera` solo enciende el lector si encuentra `com.google.mlkit.vision.barcode.BarcodeScanning`
  por nombre, así que la cámara se veía pero no leía el QR ni códigos de barras.
  `REGLAS_LECTOR_CODIGOS` (`extraProguardRules`) conserva esos nombres; lo vigila
  `src/configLector.test.ts`.
- **Nube dormida (Render gratis, ADR-023):** `ClienteApi` reintenta hasta 90 s y la app
  muestra "Despertando la nube…".
- `eas.json`: Node 22.23.4 y pnpm 12.15.0 (como el monorepo), versión de build manejada por
  EAS (`appVersionSource: remote`, `autoIncrement` en `production`).
- `assets/icono.svg` y `assets/icono-adaptativo.svg`: fuentes de los íconos (el almacén de la
  caja). Los PNG de 1024 px se generaron con `@resvg/resvg-js`.

## Pendiente

- La URL de la nube queda fija en cada build. Si se vuelve un problema, el QR de vinculación
  puede llevarla (la caja ya la conoce, ADR-016) y la app guardarla.
