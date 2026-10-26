# ADR-011: Boleta impresa, activación de `SII_DIRECTO` y pregunta inicial

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25)
- Base: ADR-001 (Estrategia A), ADR-010 (provider SII) y Res. Ex. 207/2025.

## Contexto

La Etapa 3 dejó el provider y la cola listos, pero la modalidad `SII_DIRECTO` seguía
deshabilitada: no había forma de cargar certificado/CAF, la impresora rechazaba las boletas
válidas y el primer arranque no preguntaba cómo emitir. La Etapa 4 cierra esos tres huecos
para que la caja pueda usar la Estrategia A en el ambiente de certificación.

## Decisión

### Representación impresa de la boleta válida

`packages/printer/src/plantillas/venta.ts` imprime la boleta cuando
`documento.validoComoBoleta` es `true`:

- "BOLETA ELECTRÓNICA" o "BOLETA ELECTRÓNICA EXENTA" y `N° <folio>`.
- Datos del emisor (encabezado actual), fecha y cajero.
- Detalle y total exacto (sin redondeo de efectivo; el redondeo se muestra aparte).
- Desglose Neto / IVA 19 % para la 39; Exento y Total para la 41. Si el servidor no manda
  neto/IVA, se derivan del total bruto.
- Leyenda "Verifique documento en www.sii.cl" y "Resolución SII N° … de …" (de
  `store_settings.sii_nro_resol`/`sii_fch_resol`).
- Si la venta está anulada o es reimpresión, se marca igual que el comprobante.

No se imprime el timbre PDF417. La Res. Ex. 207/2025 lo hizo opcional desde el 1-ene-2026;
el TED sigue obligatorio dentro del XML. El comprobante de las modalidades `MOCK` y
`PUENTE_MANUAL` conserva exactamente el texto "NO VÁLIDO COMO BOLETA".

### Carga de certificado y CAF

Se agrega el comando local:

```bash
pnpm --filter @almacen/server sii:cargar \
  --cert cert.pem --clave clave.pem \
  --rut-envia 76.086.428-5 --fch-resol 2026-01-01 --nro-resol 80 \
  --caf caf39.xml [--caf caf41.xml] [--ambiente produccion]
```

- Lee los secretos de archivos y los guarda **cifrados** (ADR-010).
- Nunca imprime el certificado, la clave ni el XML del CAF; solo un resumen.
- Si el certificado viene en `.pfx`, hay que convertirlo a PEM con `openssl pkcs12` (queda
  como `TODO(SII)` automatizarlo).
- El comando se ejecuta una vez por instalación; no se expone por la API HTTP para no
  circular secretos por la red local.

### Activación de la modalidad

- `MODALIDADES_DISPONIBLES` incluye `SII_DIRECTO`.
- `GET /settings` solo la muestra si `siiListo(db)`: datos legales completos, certificado
  vigente y al menos un CAF con folios.
- `PATCH /settings` rechaza elegirla con `SII_NO_CONFIGURADO` si falta algo, y
  `DATOS_LOCAL_INCOMPLETOS` si se intenta dejar el local sin los datos que van en la boleta.
- `crearProvider` del paquete `dte` **no** construye el provider SII: el servidor lo hace con
  `crearProviderDeVenta`, que inyecta el repositorio SQLite y el cliente real.

### Pregunta bloqueante del primer arranque

- Nueva columna `store_settings.dte_provider_confirmed` (por defecto `false`).
- Al entrar a la caja, si `boletaConfirmada` es `false`, la POS muestra un modal que impide
  vender. "Con la app del SII" (`PUENTE_MANUAL`) viene preseleccionada; "Desde esta caja"
  (`SII_DIRECTO`) solo se habilita si el servidor la ofrece en `modalidadesDisponibles`.
- Solo el dueño puede confirmar. El cajero ve "Pide al dueño que configure la boleta".
- En desarrollo (`db:seed`) se ofrece además "Modo prueba", porque el servidor permite
  `MOCK`; en producción esa opción no llega y no se muestra.
- La pestaña **Configuración** sigue accesible antes de confirmar, para completar RUT, giro,
  dirección y comuna; al volver a Venta, el modal reaparece hasta confirmar.
- Confirmar guarda `dte_provider_confirmed = true` en la misma transacción que el cambio de
  modalidad. La pregunta no se vuelve a mostrar.

## Verificación

- Impresora: boleta 39 con folio/IVA/verificación/resolución, boleta 41 exenta sin IVA,
  desglose derivado si faltan neto/IVA y comprobantes no válidos con su texto de siempre.
- POS: modal bloqueante, preselección de la app del SII, opción SII deshabilitada sin
  certificado, confirmación y mensaje para el cajero.
- Servidor: SII aparece en `/settings` solo con certificado/CAF/datos legales; PATCH acepta
  SII en ese caso y rechaza borrar datos legales con SII activo; `boletaConfirmada` cambia.
- Integración: venta con SII → vista previa impresa con "BOLETA ELECTRÓNICA" y
  "Verifique documento en www.sii.cl".

## Consecuencias

- La caja ya puede emitir e imprimir una boleta válida sin PDF417.
- El certificado y el CAF se cargan con un comando local; la pantalla para el dueño queda
  para la puesta en marcha (Fase 6) si se quiere evitar la línea de comandos.
- La certificación real y el set de pruebas del SII siguen pendientes: requieren el
  certificado y el CAF reales del dueño.
- Las instalaciones existentes verán la pregunta inicial una vez después de migrar.

## `TODO(SII)` pendiente

1. Implementar el PDF417 del TED cuando se quiera imprimir el timbre (hoy opcional).
2. Convertir `.pfx` a PEM automáticamente o documentar el comando para el dueño.
3. Generar el set de pruebas de certificación y registrar el resultado (F2117).
4. Mostrar en la POS la alerta de `sii.atrasadas > 0` del `/health`.
5. Definir el flujo de carga de un CAF nuevo cuando se agota, sin reiniciar la caja.
