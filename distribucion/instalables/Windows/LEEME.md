# Instalador de Windows

Archivo incluido:

```text
Almacen-POS-0.1.0-Windows-x64.exe
```

Generado por el workflow **`instalador-windows`** de GitHub Actions (run `40932628773`, commit
`86018ef`). Incluye como valor inicial:

```text
ALMACEN_CLOUD_URL = https://almacen-pos-nube.fly.dev
ALMACEN_CONTACTO  = arrayan.labs@gmail.com
```

La URL quedó embebida en `almacen-pos.exe`; se puede cambiar después desde la app.
**Falta probarlo en un PC Windows real**: sidecar, impresora USB, gaveta y lector.

SHA-256:

```text
4c90bfdff0714ac5133591cc6c1fd5364c572e5622d0189a7af4da0b9a0351dc
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
- [ ] Abre en **pantalla completa**; Alt+F4, la tecla Windows, Alt+Tab, F5 y Ctrl+P no la
      sacan, y los atajos de la caja (F2, F4, F12, Esc) funcionan.
- [ ] Con la **caja abierta** el programa no se cierra (aparece el aviso) y en Configuración →
      Pantalla completa el botón está deshabilitado.
- [ ] Con la caja cerrada, el dueño sale de pantalla completa y puede cerrar el programa.
- [ ] Con la caja abierta, *Finalizar tarea* en el Administrador de tareas y volver a abrir:
      en **Caja** aparece el aviso de cierre inesperado.
- [ ] Cerrar y volver a abrir conserva los datos.

> Para que el cajero tampoco pueda usar Ctrl+Alt+Supr ni el Administrador de tareas, deja el PC
> con una **cuenta de cajero** (`docs/INSTALADOR.md`, "Pantalla completa y cierre de la caja").

> La impresora por **red (IP:9100)** es la opción más predecible. La impresora USB por cola del
> sistema ya está implementada, pero es justamente lo que falta validar en Windows.
