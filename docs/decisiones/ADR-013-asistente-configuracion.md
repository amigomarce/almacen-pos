# ADR-013: Asistente de primera configuración y vinculación por QR

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25)
- Base: Fase 6 (`docs/PLAN_FASES.md`), ADR-005 y ADR-011.

## Contexto

Al terminar la Etapa 4, el dueño ya elige la modalidad de boleta en el primer arranque, pero
no tiene una guía para dejar la caja operativa: datos legales, impresora, prueba del lector y
vinculación del celular. El vínculo con la app móvil existía solo por consola
(`device:info`), y la pantalla móvil pedía pegar instalación y token a mano.

## Decisión

### Asistente dentro de Configuración

Se agrega **Configuración → Primera configuración**, una tarjeta al inicio de la pantalla con:

1. **Datos del local**: RUT, razón social, giro, dirección y comuna. Muestra qué falta y
   enlaza a la sección de datos.
2. **Forma de emitir**: si la modalidad ya se confirmó y cuál es; si falta, enlaza a la
   sección de boleta.
3. **Impresora**: si hay una configurada y su transporte; enlaza a la sección de impresora.
4. **Prueba del lector**: input que consulta `GET /products/lookup/:barcode` y muestra el
   producto encontrado. Sirve para verificar el lector USB (HID) sin abrir una venta.
5. **Vinculación del celular**: QR con `installationId`, `deviceToken` y nombre de la caja.

Después de confirmar la modalidad en el primer arranque, la POS lleva al dueño a esta
pantalla. Puede volver a Venta cuando quiera; la configuración no bloquea la venta.

Los pasos se refrescan cuando se guardan datos del local o de la impresora, mediante un
evento `almacen:configuracion` en la ventana (sin polling).

### Datos y QR

- `GET /setup` (solo dueño, `cache-control: no-store`) devuelve el resumen y la identidad de
  la instalación. El `deviceToken` solo se entrega por esta ruta autenticada porque el QR lo
  necesita; no se loguea ni se expone en otra respuesta.
- El QR se genera **en el navegador** con `toqr` (MIT, sin red ni servicio externo) y se
  dibuja como SVG. El contenido es:
  `almacenpos://vincular?instalacion=…&token=…&caja=…`.
- La pantalla advierte que el código no se comparta: permite vincular la caja a una cuenta.
- La app móvil ya lee el QR con `expo-camera` y completa instalación, token y nombre; la
  carga manual sigue disponible como respaldo.

## Consecuencias

- El dueño tiene una guía visible y el flujo de primera configuración queda completo sin
  instalar nada adicional.
- `toqr` es una dependencia pequeña y pura; no agrega servicios ni llamadas de red.
- El token de la caja viaja en el QR y en `/setup`; ambos son de uso local y solo para el
  dueño. No se debe imprimir el QR ni compartirlo fuera del local.
- La prueba de escáner valida lector + lookup, no la impresión de la boleta.
- El parser del QR vive en `apps/mobile/src/vinculacion.ts` y tiene tests propios.

## Verificación

- Servidor: `/setup` resume faltantes, modalidad, impresora y vinculación; solo dueño;
  `no-store`.
- POS: la tarjeta muestra pasos, prueba un código contra el lookup falso y renderiza el QR;
  el flujo de confirmación de modalidad lleva a la primera configuración.
- Móvil: parser del QR probado (URL, parámetros codificados y casos inválidos) y typecheck.
- Typecheck, lint, formato, 1136 tests y cobertura.
