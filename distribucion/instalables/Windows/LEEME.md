# Instalador de Windows

Archivo incluido:

```text
Almacen-POS-0.1.0-Windows-x64.exe
```

Generado por el workflow **`instalador-windows`** de GitHub Actions (run `40298970706`, commit
`9d154c5`). **Falta probarlo en un PC Windows real**: sidecar, impresora USB, gaveta y lector.

SHA-256:

```text
1b40a4369d6c92a703b5f16c98f116840490853d32ff4f80e3fed4bd722bacd6
```

## Cómo regenerarlo

### Opción A — GitHub Actions (recomendada)

1. Ejecutar el workflow **`instalador-windows`** en GitHub Actions.
2. Descargar el artefacto **`instalador-windows`**.
3. Dentro viene `apps/pos/src-tauri/target/release/bundle/nsis/*.exe`.
4. Copiarlo acá con el nombre de arriba.

### Opción B — compilar en un PC Windows

Requisitos: Node 22, pnpm, Rust y las herramientas de Tauri (ver
[`../manuales/Guia-Instalacion.md`](../manuales/Guia-Instalacion.md)).

```bash
pnpm install
pnpm data:build
pnpm --filter @almacen/pos tauri build
```

El resultado queda en `apps/pos/src-tauri/target/release/bundle/nsis/`.

## Instalación

1. Ejecutar el `.exe`. Es una instalación **por usuario** (no pide administrador).
2. SmartScreen puede advertir porque el instalador no está firmado: **Más información →
   Ejecutar de todas formas**.
3. Abrir **Almacén POS**. El primer arranque crea la base, la semilla y el dueño.

## Qué probar en el PC real

- [ ] El sidecar de Node arranca (la app abre y responde).
- [ ] La semilla de productos carga.
- [ ] La impresora USB aparece en la lista de colas del sistema y acepta el ticket de prueba.
- [ ] La gaveta abre en efectivo y no abre con tarjeta.
- [ ] El lector de código de barras funciona como teclado.
- [ ] El respaldo local se crea y la app muestra “En la nube”.
- [ ] Cerrar y volver a abrir conserva los datos.

> La impresora por **red (IP:9100)** es la opción más predecible. La impresora USB por cola del
> sistema ya está implementada, pero es justamente lo que falta validar en Windows.
