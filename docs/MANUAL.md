# Manual rápido del dueño

**Caja + app del dueño · versión 0.1 · octubre 2026**

> Versión imprimible: [`manual-1-pagina.html`](manual-1-pagina.html) o [`manual-1-pagina.pdf`](manual-1-pagina.pdf).

## 1. Primer arranque (solo una vez)

1. Abre la app de la caja. Si la base es nueva, crea el **dueño** (nombre y PIN de 4 a 8
   dígitos), el nombre de la **caja** y, si quieres, un **cajero** con su PIN.
2. Elige cómo emitir: **Con la app del SII** (la caja imprime un comprobante y tú emites la
   boleta en e-Boleta) o **Desde esta caja** (boleta propia; requiere certificado y CAF).
3. En **Configuración → Primera configuración** completa RUT, razón social, giro, dirección y
   comuna; configura la impresora y prueba el lector.
4. Para vincular el celular: en la caja abre **Configuración → Primera configuración** y muestra
   el QR. En la app del dueño entra a **Caja → Escanear QR de la caja**.

## 2. Vender en la caja

1. **Abre la caja** con el efectivo inicial del turno.
2. Escanea el código o busca el producto (F2). Para pan, verduras o venta por monto usa los
   botones rápidos o la línea por peso/monto.
3. Ajusta cantidad con **F4** si hace falta.
4. Pulsa **Cobrar (F12)**, elige **Efectivo, Débito, Crédito o Transferencia**. En efectivo,
   escribe cuánto pagó el cliente para calcular el vuelto.
5. Entrega el comprobante o la boleta que salga por la impresora.

- **Venta en espera (F8):** "se me olvidó la leche". F8 guarda la venta, atiendes al siguiente
  y F8 la retoma (con varias, eliges cuál con su número).
- **Ventas del turno:** en **Caja → Ventas del turno** abre cualquier venta para
  **reimprimirla**, **anularla** o **devolver productos** (devolución parcial: devuelve lo que
  se pagó por esos productos, por el mismo medio). Anular y devolver piden la clave del dueño y
  un motivo; el stock vuelve solo. Si la boleta ya se emitió, haz la nota de crédito en el SII.
- **Fiado:** al cobrar, tecla **F** y elige al vecino. Si pasa su límite, se pide la clave del
  dueño. En la pestaña **Fiado** se ven las deudas y se reciben **abonos** (imprime recibo); el
  dueño crea vecinos, les pone límite y hace ajustes con motivo.
- **Retiros e ingresos:** en **Caja → Retiros e ingresos de efectivo** anota la plata que sale
  del cajón sin ser venta (pago al proveedor del pan, retiro) o que entra (sencillo). El cierre
  la descuenta o suma.
- Atajos: **F2** buscar, **F4** cantidad, **F8** en espera, **F12** cobrar, **Esc** cancelar.
  En el cobro: **E** efectivo, **D** débito, **C** crédito, **T** transferencia, **F** fiado.
- Con tarjeta, según la configuración, el **voucher puede ser la boleta**. Si no, emite la
  boleta en la app del SII.

## 3. Cerrar el turno

**Caja → Cerrar caja**, cuenta el efectivo y confirma. La caja imprime el cierre con la
diferencia entre lo contado y lo esperado. Ese cierre aparece en la app del dueño.

La caja funciona en **pantalla completa** y, mientras haya una caja abierta, **el programa no
se cierra**: primero el cierre de caja. Para salir de pantalla completa: **Configuración →
Pantalla completa** (solo el dueño, con la caja cerrada). Si la caja se apagó sin cerrar (corte
de luz o cierre forzado), el dueño lo ve anotado en **Caja**.

## Productos nuevos

Si el código no está en la base, la caja ofrece crearlo: escribe nombre, precio, si se vende por
unidad o por kg y el stock. La próxima vez lo reconoce solo. Para balanza (códigos que empiezan
con 20–29) usa la etiqueta del pesaje.

**Etiquetas por cambiar:** cuando cambia un precio (en la caja o desde el celular), en
**Productos** aparece **Etiquetas de precio por cambiar**. Imprímelas en la térmica y pégalas en
la góndola, o márcalas si ya las cambiaste a mano.

> **Regla de oro:** la caja es la fuente de verdad. No borres archivos ni la base; si algo no
> cuadra, crea un respaldo y contacta a soporte.

## 4. App del dueño (celular)

Entra con el **correo y contraseña** que te entregó Arrayan Labs. Necesita internet; la caja
sigue vendiendo aunque el celular no tenga señal.

| Pestaña      | Para qué sirve                                                                 |
| ------------ | ------------------------------------------------------------------------------ |
| **Inicio**   | Ventas de hoy, último cierre, **fiado** (quién debe y cuánto) y stock bajo.   |
| **Reportes** | Hoy, 7 o 30 días: ventas netas, lo más vendido, margen, ventas por hora y por día, y **qué comprar**. |
| **Productos**| Buscar por nombre, marca o código y **cambiar el precio** de venta.            |
| **Precios**  | Subir o bajar precios por **marca** o **ID de categoría** (ej. +5 o -10 %).    |
| **Recibir**  | Escanear mercadería con la cámara o el código; suma 1 unidad/kg por escaneo.   |
| **Caja**     | Vincular esta caja escaneando su QR; también permite escribir los datos a mano.|

> **Precios** aplica el cambio de inmediato y no tiene vista previa: revisa bien la marca, la
> categoría y el porcentaje antes de confirmar.

## 5. Boleta electrónica

- **Con la app del SII:** la caja imprime “Comprobante de venta — no válido como boleta”.
  Emite la boleta en la app e-Boleta del SII por el total exacto y, si quieres, registra el folio.
- **Desde esta caja:** la boleta se timbra e imprime en la caja y se envía al SII en segundo
  plano. Si no hay internet, queda en cola y se envía al volver la conexión.
- No borres los XML ni las boletas: deben conservarse **6 años**. La caja los guarda.
- Si aparece **MODO PRUEBA**, la caja no emite boletas: cambia la modalidad en Configuración.

## 6. Respaldos y problemas

- La caja respalda sola **una vez al día** y conserva los últimos 14. En
  **Configuración → Respaldos** puedes crear uno ahora.
- En **Configuración → Nube y respaldo cifrado** puedes activar el respaldo automático en la
  nube. Descarga la **clave de respaldo** y guárdala: sin ella no se puede restaurar.
- **Copia también la carpeta local a un pendrive** una vez por semana. El respaldo incluye la
  clave del SII: guárdalo en un lugar seguro.
- **Sin internet:** la caja sigue vendiendo; las boletas SII se encolan.
- **No imprime:** revisa papel, cable o red y usa **Configuración → Impresora → Imprimir prueba**.
- **No abre o no conecta:** cierra y vuelve a abrir la app; si sigue, reinicia el equipo.
- **Olvidaste el PIN del dueño:** restaura un respaldo o contacta a soporte.

**Soporte:** Arrayan Labs · arrayan.labs@gmail.com
