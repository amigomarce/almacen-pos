# App de caja — macOS

El `.dmg` no se versiona en git porque pesa ~53 MB. En esta carpeta está el archivo generado:

```text
Almacen-POS-0.1.0-macOS-AppleSilicon.dmg
```

Si falta (por ejemplo, en un clon nuevo del repositorio), se genera desde la raíz del proyecto:

```bash
ALMACEN_CLOUD_URL=https://almacen-pos-nube.fly.dev ALMACEN_CONTACTO=arrayan.labs@gmail.com \
  pnpm --filter @almacen/pos tauri build --bundles app

APP="apps/pos/src-tauri/target/release/bundle/macos/Almacén POS.app"
OUT="distribucion/instalables/macOS/Almacen-POS-0.1.0-macOS-AppleSilicon.dmg"
hdiutil create -volname "Almacén POS" -srcfolder "$APP" -ov -format UDZO "$OUT"
```

La compilación es para **Apple Silicon** (`aarch64`). Para un Mac Intel hay que compilar en esa
arquitectura.

La app no está firmada ni notarizada: en el primer arranque hay que hacer clic derecho → Abrir.
Si macOS la marca como dañada:

```bash
xattr -dr com.apple.quarantine "/Applications/Almacén POS.app"
```

SHA-256 esperado del DMG de esta entrega:

```text
fc3a7d32868415179722fa2fde814a409774a68adc4995b308da722d4ab93ebc
```
