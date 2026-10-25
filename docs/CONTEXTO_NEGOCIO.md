# Contexto del negocio

## El cliente tipo

- Almacén / minimarket de barrio en Chile. Un local, 1–2 cajas, 30–80 m².
- Entre 800 y 3.000 productos distintos: abarrotes, lácteos, bebidas, snacks, confites,
  aseo personal, limpieza, cigarros, pan, frutas y verduras, fiambrería, congelados,
  mascotas, librería básica, recargas.
- Dueño de 35–65 años, usa WhatsApp y el banco en el celular, pero no es "de computadores".
- Hoy probablemente: cuaderno, calculadora, boleta emitida desde el POS de tarjetas o
  desde el facturador gratuito del SII, y precios "en la cabeza" del dueño.

## Dolores que resolvemos

1. Inventariar es imposible: miles de productos. → **Base semilla** + "escanear y poner precio".
2. Cambiar precios es lento (sube el proveedor todos los meses). → **Precio desde el celular**,
   cambio masivo por categoría o marca (+5 %), y alerta de margen bajo.
3. No sabe qué se vende ni cuánto gana. → Ventas del día/semana, top productos, stock bajo.
4. Obligación de entregar boleta impresa en cada venta (Res. Ex. SII N°12/2025). →
   Boleta electrónica impresa automáticamente al cobrar.
5. Filas en horas punta. → Caja rápida, teclado + lector.

## Usuarios y permisos

| Rol | Puede |
|---|---|
| Dueño (admin) | Todo. Precios, stock, usuarios, reportes, configuración SII. |
| Cajero | Vender, anular la última venta con clave del dueño, abrir/cerrar caja. |

PIN de 4 dígitos para cambiar de usuario en la caja. Login con correo en la app móvil.

## Flujos clave

### Venta
1. Escanear producto → aparece en la lista con nombre grande y precio.
2. Si el código no existe en el local pero sí en la base semilla → se agrega al instante
   con un popup mínimo "¿Precio de venta?" (y opcional stock). Si no existe en ninguna →
   "Producto nuevo": nombre + precio, queda marcado para completar después.
3. Cantidad: escanear de nuevo suma 1; `*` o F4 para cantidad; balanza para kg.
4. Cobrar (F12) → medio de pago → si es efectivo, "Paga con" y muestra **vuelto** gigante.
5. Se emite la boleta, se imprime, se descuenta stock. Siguiente cliente.

### Recepción de mercadería (entrada de stock)
Modo "Recibir pedido": escanear productos que llegaron + cantidad + costo (opcional).
Actualiza stock y costo promedio. También desde el celular con la cámara.

### Cambio de precio desde el celular
Buscar o escanear con la cámara → editar precio → guardar. Se sincroniza a la caja
en segundos (si hay internet) y se imprime opcionalmente una etiqueta de góndola.

### Cierre de caja
Total por medio de pago, efectivo esperado vs contado, diferencia. Resumen al celular del dueño.

## Hardware objetivo (económico, fácil de conseguir en Chile)

- PC o mini-PC con Windows 10/11 (o laptop), pantalla ideal táctil 15".
- Lector de código de barras USB **modo teclado (HID)** 1D/2D.
- Impresora térmica **ESC/POS** 80 mm (o 58 mm) USB/Ethernet (tipo Epson TM-T20, Xprinter,
  Bixolon, 3nStar). Debe imprimir el **timbre electrónico PDF417** (imprimir como imagen
  para compatibilidad universal).
- Opcional: balanza con etiqueta (códigos 2x), cajón de dinero conectado a la impresora (pulso ESC/POS).
