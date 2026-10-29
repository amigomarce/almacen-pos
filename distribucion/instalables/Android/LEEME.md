# App del dueño — Android

En esta carpeta está el APK generado con EAS Build (build `e3441aca`, commit `86018ef`, con la
pestaña **Reportes**). No se versiona en git (pesa ~88 MB):

```text
Almacen-Dueno-0.1.0-Android.apk
```

SHA-256:

```text
110ebb63e00c0ac95ccd37736f2e946b5e2f6b3b6a9a490ea932b3c4d9d53046
```

Si falta (por ejemplo, en un clon nuevo del repositorio), se genera así:

## Generar el APK

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Al terminar (10–15 min, más si hay cola en Expo: hasta ~30 min), descargar el `.apk` y guardarlo acá como:

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
