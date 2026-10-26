# App del dueño — Android

El APK **no está incluido** en esta carpeta. Se genera con EAS Build (Expo) y se descarga desde
el enlace que entrega el servicio.

## Generar el APK

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Al terminar (~10–15 min), descargar el `.apk` y guardarlo acá como:

```text
Almacen-Dueno-0.1.0-Android.apk
```

El perfil `preview` usa:

```text
EXPO_PUBLIC_CLOUD_URL=https://almacen-pos-nube.fly.dev
```

y la anon key de Supabase configurada en las variables de EAS. Detalle en
[`../manuales/Guia-App-Dueno.md`](../manuales/Guia-App-Dueno.md).

## Instalar y probar

1. Pasar el `.apk` al teléfono (cable, Drive o el QR de EAS).
2. Permitir “instalar apps de fuentes desconocidas” para el navegador o el gestor de archivos.
3. Abrir **Almacén Dueño**, iniciar sesión con la cuenta del dueño.
4. En la caja: Configuración → Primera configuración → mostrar el QR.
5. En la app: escanear el QR para vincular la caja.
6. Probar: ventas del día, stock bajo, editar precio, cambio masivo y recepción.

> La app del dueño **no se conecta directo a la caja**: habla con
> `https://almacen-pos-nube.fly.dev`. La caja sube sus datos cada 10 s.
