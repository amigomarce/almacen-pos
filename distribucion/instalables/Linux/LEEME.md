# Instalador de Linux (Zorin OS Lite)

Archivo incluido:

```text
Almacen-POS-0.1.0-Linux-x64.deb
```

Generado por el workflow **`instalador-linux`** de GitHub Actions (run `40876334711`, commit
`3b8a6d2`), en Ubuntu 22.04: sirve para Zorin OS 17 y 18 (x86_64). Incluye como valor inicial:

```text
ALMACEN_CLOUD_URL = https://almacen-pos-nube.fly.dev
```

La URL se puede cambiar después desde la app. La consulta en línea a Open Food Facts va
**desactivada** (no se definió `ALMACEN_CONTACTO`): los códigos que no están en la base semilla
se cargan a mano.

En CI se instaló y arrancó (base, semilla, respaldo y `/health` OK). **Falta probarlo en el
equipo real**: pantalla, RAM, impresora USB, gaveta, lector y atajos de XFCE.

SHA-256:

```text
03947598d2bddf71980a73e5a6bbac2d5c505d91e1e5089f0e4fcdedddba3aac
```

## Cómo regenerarlo

```bash
gh workflow run instalador-linux.yml --ref main
gh run list --workflow instalador-linux.yml --limit 1
gh run download <id> -n instalador-linux -D ./instalador
```

Copiar el `.deb` acá con el nombre de arriba. Para compilar en un Ubuntu/Zorin propio, ver
[`../../../docs/INSTALADOR.md`](../../../docs/INSTALADOR.md), sección "Linux (Zorin OS Lite)".

## Instalación

Conviene un **usuario dedicado** a la caja (por ejemplo `caja`): el paso 2 cambia los atajos del
escritorio de ese usuario.

1. Copiar el `.deb` al equipo (pendrive) e instalarlo; `apt` baja WebKitGTK si falta:
   ```bash
   sudo apt install ./Almacen-POS-0.1.0-Linux-x64.deb
   ```
2. Con la sesión del usuario de la caja abierta:
   ```bash
   bash /usr/share/almacen-pos/configurar-caja-linux.sh
   ```
3. Cerrar sesión y volver a entrar: la caja se abre sola en pantalla completa.

Para deshacer el paso 2: `bash /usr/share/almacen-pos/configurar-caja-linux.sh --deshacer`.

## Qué probar en el equipo real

- [ ] La caja abre y no queda en blanco (si queda, ver "Si algo falla" en `docs/INSTALADOR.md`).
- [ ] La semilla de productos carga.
- [ ] RAM libre con la caja abierta (`free -h`) y que vender no se sienta lento.
- [ ] La impresora USB imprime el ticket de prueba (`/dev/usb/lp0` o cola de CUPS "Raw").
- [ ] La gaveta abre en efectivo y no abre con tarjeta.
- [ ] El lector de código de barras funciona como teclado.
- [ ] El respaldo local se crea y la app muestra “En la nube”.
- [ ] Abre en **pantalla completa**; Alt+F4, la tecla Super, Alt+Tab, F5 y Ctrl+P no la sacan,
      y los atajos de la caja (F2, F4, F12, Esc) funcionan.
- [ ] Con la **caja abierta** el programa no se cierra (aparece el aviso).
- [ ] Con la caja cerrada, el dueño sale de pantalla completa y puede cerrar el programa.
- [ ] Con la caja abierta, `pkill almacen-pos` y volver a abrir: en **Caja** aparece el aviso
      de cierre inesperado.
- [ ] Reiniciar el equipo: la caja abre sola y conserva los datos.
