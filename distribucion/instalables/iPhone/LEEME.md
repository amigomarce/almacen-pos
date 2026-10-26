# App del dueño — iPhone

No hay un archivo `.ipa` para entregar. La app se distribuye por **TestFlight**.

## Compilar y subir

Requiere cuenta Apple Developer (US$ 99/año).

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

En ~15–30 min el build aparece en **App Store Connect → TestFlight**. Agregar a los probadores
por correo; ellos instalan la app **TestFlight** y desde ahí instalan **Almacén Dueño**.

## Probar

1. Iniciar sesión con la cuenta del dueño.
2. En la caja: Configuración → Primera configuración → mostrar el QR.
3. Escanear el QR desde la app.
4. Probar ventas del día, stock bajo, edición de precio y recepción.

Detalle en [`../manuales/Guia-App-Dueno.md`](../manuales/Guia-App-Dueno.md).
