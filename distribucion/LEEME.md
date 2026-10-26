# Distribución — Almacén POS

Carpeta de entrega con las aplicaciones instalables y los manuales del sistema. Versión
**0.1.0** (2026-10-26).

> Los archivos grandes (`.dmg`, `.exe`, `.apk`, `.ipa`) **no se versionan en git**. Se generan
> localmente o en CI y se copian a esta carpeta. Los manuales y las instrucciones sí quedan en
> el repositorio.

## Contenido

```text
distribucion/
├── LEEME.md
├── instalables/
│   ├── macOS/
│   │   └── Almacen-POS-0.1.0-macOS-AppleSilicon.dmg
│   ├── Windows/
│   │   └── Almacen-POS-0.1.0-Windows-x64.exe
│   ├── Android/     ← el .apk se genera con EAS Build
│   └── iPhone/      ← se distribuye por TestFlight
└── manuales/
    ├── Manual-Rapido-Dueno.pdf
    ├── Manual-Rapido-Dueno.md
    ├── Manual-Rapido-Dueno.html
    ├── Guia-Instalacion.md
    ├── Guia-App-Dueno.md
    └── Guia-Respaldos.md
```

## macOS (incluido)

Archivo: `instalables/macOS/Almacen-POS-0.1.0-macOS-AppleSilicon.dmg`

Requisitos: Mac con **Apple Silicon** (M1/M2/M3/M4). La app está compilada para `aarch64`; para
un Mac Intel hay que generar otra compilación.

1. Abre el `.dmg`.
2. Arrastra **Almacén POS** a la carpeta **Aplicaciones**.
3. La app **no está firmada ni notarizada**. La primera vez, haz clic derecho sobre ella →
   **Abrir** → **Abrir**.
4. Si macOS dice que está dañada o no se puede abrir, ejecuta:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Almacén POS.app"
   ```

5. Abre la app. En el primer arranque se crean el dueño, la caja y el cajero.

SHA-256 del DMG:

```text
d845dc019e473a792ff3e380747c40a7fccce011b7c2144a53c6a7566f73465e
```

## Windows (incluido, sin probar en PC real)

Archivo: `instalables/Windows/Almacen-POS-0.1.0-Windows-x64.exe`

Generado por el workflow **`instalador-windows`** de GitHub Actions (run `40298970706`, commit
`9d154c5`). Es una instalación **por usuario** (no pide administrador).

1. Ejecuta el `.exe`. SmartScreen puede advertir porque no está firmado: **Más información →
   Ejecutar de todas formas**.
2. Abre **Almacén POS**. El primer arranque crea la base, la semilla y el dueño.
3. Prueba en el PC real: sidecar, impresora USB, gaveta, lector y respaldo. Es lo único que
   falta validar de este instalador.

SHA-256 del `.exe`:

```text
1b40a4369d6c92a703b5f16c98f116840490853d32ff4f80e3fed4bd722bacd6
```

Para regenerarlo: ejecutar el workflow o compilar en un PC Windows
([`manuales/Guia-Instalacion.md`](manuales/Guia-Instalacion.md)). El artefacto de CI contiene
`apps/pos/src-tauri/target/release/bundle/nsis/*.exe`.

## Android (pendiente de generar)

El APK se genera con EAS Build (no se compila en este Mac):

```bash
cd apps/mobile
npx eas-cli build --platform android --profile preview
```

Al terminar, descarga el `.apk` desde el enlace de EAS y guárdalo como:

```text
instalables/Android/Almacen-Dueno-0.1.0-Android.apk
```

La app usa `EXPO_PUBLIC_CLOUD_URL=https://almacen-pos-nube.fly.dev` en el perfil `preview`.
Detalle en [`manuales/Guia-App-Dueno.md`](manuales/Guia-App-Dueno.md).

## iPhone (TestFlight)

No hay archivo `.ipa` para entregar. Se compila y sube a TestFlight:

```bash
cd apps/mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

Luego se agrega a los probadores por correo desde App Store Connect.

## Manuales

| Archivo | Para quién | Contenido |
|---|---|---|
| `Manual-Rapido-Dueno.pdf` | Dueño / cajero | Una página: primer arranque, venta, cierre, anulación, boleta, respaldos y app del dueño |
| `Manual-Rapido-Dueno.md` | Dueño / cajero | Misma guía en texto, para editar o imprimir |
| `Manual-Rapido-Dueno.html` | Diseño / imprenta | Fuente HTML del PDF |
| `Guia-Instalacion.md` | Técnico | Instalación, sidecar, variables, Windows/macOS y limitaciones |
| `Guia-App-Dueno.md` | Técnico / dueño | EAS, APK, TestFlight y vinculación de la caja |
| `Guia-Respaldos.md` | Técnico / dueño | Respaldo local, cifrado en la nube y restauración |

SHA-256 del manual PDF:

```text
792df46446f1f04ef3cc0ca261173aa6ba539a776049a0aba05f054dc77e315c
```

> Los manuales son copias de `docs/` a la fecha de esta entrega. Si actualizas la documentación,
> vuelve a copiarlos a `distribucion/manuales/` y actualiza los hashes.

## Antes de la prueba física

- Usar la modalidad **“Con la app del SII”** (`PUENTE_MANUAL`). **No emitir boletas reales**
  desde la caja hasta completar la certificación del SII.
- Tener el respaldo automático activo y **descargar `respaldo.key`** desde
  Configuración → Nube y respaldo cifrado. Sin esa clave no se puede restaurar un respaldo
  remoto.
- En Fly, agregar una tarjeta para que la nube quede siempre encendida. Con la cuenta en trial
  la máquina se detiene a los 5 minutos y el primer acceso puede demorar.
- Probar primero con datos de prueba; si se usan ventas reales, hacer un respaldo antes.

## Verificación rápida

1. Instalar la app y completar el primer arranque.
2. Configurar la impresora y imprimir un ticket de prueba.
3. Venta en efectivo: imprime y abre la gaveta.
4. Venta con débito: imprime y **no** abre la gaveta.
5. Reimprimir: no abre la gaveta.
6. Escanear productos con el lector.
7. Cerrar caja y revisar el cuadre.
8. Vincular la app del dueño con el QR y probar un cambio de precio.
9. **Respaldar ahora** y verificar “En la nube”.
10. Desconectar internet, vender y reconectar: la venta debe sincronizar.
