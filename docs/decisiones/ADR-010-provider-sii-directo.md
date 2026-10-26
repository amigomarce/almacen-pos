# ADR-010: `SiiDirectoProvider` — emisión offline, cola persistente y reintentos

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25)
- Base: ADR-001 (Estrategia A), ADR-008 (DTE de boleta) y ADR-009 (envío al SII).

## Contexto

La Etapa 2 dejó el cliente HTTP y el `EnvioBOLETA` probados, pero sin nadie que decidiera
cuándo emitir, de dónde sacar el folio, dónde guardar la boleta mientras no hay internet ni
cómo reintentar. La Etapa 3 cierra ese circuito con `SiiDirectoProvider`.

La caja debe vender **offline**: el folio y el timbre se generan al instante con el CAF local;
el envío al SII es asíncrono y puede esperar a que vuelva la red (Res. 74/2020 exige
despachar dentro de 1 hora). El servidor local (SQLite) es la fuente de verdad.

## Decisión

### Provider y puertos

`packages/dte/src/sii/provider.ts` implementa `DocumentoTributarioProvider` sin depender de
SQLite ni de la red:

- `RepositorioSii`: reserva folios, guarda la boleta pendiente, lista pendientes, marca
  enviada/error y actualiza el estado por `trackId`.
- `ClienteSiiPort`: el subconjunto del cliente del SII que usa el provider (`enviarBoletas`,
  `consultarEstado`). En producción se inyecta `ClienteSii`; en tests, un doble.

El adaptador SQLite vive en `apps/server/src/sii/repositorio.ts`:
`caf_ranges.next_folio` para los folios y `tax_documents` para la cola.

### Emisión offline y folios

1. Se valida la venta y se decide el tipo (39/41) con `tipoDteSegunTotales`.
2. `reservarFolio` busca el primer CAF vigente del tipo con folios disponibles, descifra su
   XML y **incrementa `next_folio` en la misma transacción**. El folio queda reservado antes
   de generar el XML.
3. Se genera el DTE firmado y se guarda en `tax_documents` con estado `PENDIENTE`.
4. Se devuelve `DocumentoEmitido` con `validoComoBoleta: true`, `estadoSii: 'PENDIENTE'`,
   XML, TED y las leyendas de la boleta.

Un folio reservado **no se reutiliza**: si la generación falla, se salta uno. El SII exige
correlatividad y reutilizar un folio es peor que dejar un hueco. `reservarFolio` rechaza CAF
vencidos o agotados con `CAF_AGOTADO`.

### Cola y envío

- `enviarPendientes` toma hasta 50 boletas por lote (máximo del SII) y hasta 10 lotes por
  pasada (500 boletas), en orden de emisión.
- Cada lote se firma como `EnvioBOLETA` y se envía con el `ClienteSii`.
- Si el envío falla, **se detiene la pasada**: no tiene sentido seguir con el siguiente lote
  si el SII o la red están caídos. Se registra `attempts + 1`, `last_attempt_at` y
  `last_error` en cada boleta del lote.
- Éxito: `sii_status = ENVIADO`, `track_id` y `sent_at`.
- Reintentos con espera exponencial: 1, 2, 4, 8, 15 y 30 minutos (tope), hasta 10 intentos.
  Una boleta que agotó los intentos queda `PENDIENTE` para intervención del dueño.
- El ciclo de fondo (`iniciarEnvioSii`, cada 2 minutos) evita pasadas solapadas. Al arrancar
  hace una pasada inmediata: si la caja estuvo apagada, la cola sale apenas vuelve.

### Estado y alertas

`consultarEstado(trackId)` consulta el detalle del envío y traduce:

- cualquier documento `RCH`/`RLV` → `RECHAZADO`;
- algún `RPR` → `REPARO`;
- todos `DOK` → `ACEPTADO`;
- sin detalle, el estado global (`REC/EPR/CRT/FOK/PRD/SOK` → `ENVIADO`;
  `RCH/RCO/VOF/RFR/RPT/RSC/RCT` → `RECHAZADO`; `RPR` → `REPARO`).

El resultado se refleja en `tax_documents` por `track_id`. `/health` expone
`{ pendientes, masAntiguaMin, atrasadas }`; una boleta lleva más de 45 minutos pendiente es
un aviso para el dueño (el plazo legal es 1 hora).

### Secretos

- Certificado y clave privada: un JSON cifrado en `store_settings.sii_credenciales`.
- CAF: el XML cifrado en `caf_ranges.xml_encrypted`.
- Cifrado AES-256-GCM con una clave local de 32 bytes en `var/sii.key` (permisos 600) o en
  `ALMACEN_SII_KEY`. Nunca se escribe en logs, API ni repositorio.
- Al cargar el certificado se valida que sea X.509, que la clave corresponda y que no esté
  vencido. Al cargar un CAF se valida que sea del mismo RUT del local y que no se superponga
  con otro rango.

### Lectura y reimpresión

`obtenerVenta` ya no reemite documentos `SII_DIRECTO` para armar las leyendas: las lee de la
base. Reemitir consumiría un folio nuevo en cada reimpresión.

### Activación

La activación se completó en la Etapa 4 (ADR-011): la modalidad aparece en Configuración
solo cuando `siiListo(db)` (datos legales, certificado vigente y CAF), el dueño la confirma
en la pregunta del primer arranque y la impresora ya sabe imprimir la boleta válida. La
certificación real ante el SII sigue pendiente de los documentos del dueño.

## Verificación

- Tests del provider con repositorio en memoria: emisión 39/41, voucher, total cero, CAF
  agotado, correlatividad, lotes de 50, error y espera exponencial, tope de intentos,
  XML corrupto y traducción de estados.
- Tests del adaptador SQLite con base real: reserva persistente, CAF vencido/agotado,
  guardado de la cola, `attempts`/`last_error`, `track_id` y estado definitivo.
- Test de integración con la app: venta en efectivo → DTE pendiente → envío con `fetch`
  falso → `ENVIADO`/`ACEPTADO`, y reimpresión sin consumir folio.
- Cifrado: roundtrip, IV distinto, clave incorrecta, secreto corrupto y archivo de clave 600.

## Consecuencias

- La emisión no espera a la red y la venta nunca se pierde por un problema del SII.
- El XML queda en `tax_documents` para reimprimir y conservar 6 años.
- Un folio puede quedar quemado si falla la generación; es intencional.
- La cola es local; la nube no la replica. Si la caja se pierde, se pierde la cola (los XML
  están en el respaldo local).
- La activación requiere cargar certificado/CAF (hoy por código/CLI; la pantalla de carga se
  hará en la Etapa 4) y completar la certificación.

## `TODO(SII)` pendiente

1. Convertir el certificado real (`.pfx`) a PEM con su clave; hoy el cargador interno acepta
   PEM. Documentar el comando `openssl pkcs12` para el dueño.
2. Confirmar el comportamiento del SII ante un `RPT` (envío repetido) y definir si la cola
   debe marcar el lote como enviado antes de recibir la respuesta (idempotencia).
3. Implementar la representación impresa de la boleta válida y, si se imprime, el PDF417 del
   TED (Res. Ex. 207/2025: el timbre impreso es opcional desde 2026).
4. Alertar en la pantalla de la caja cuando `atrasadas > 0` (hoy está en `/health`).
5. Definir qué hacer si se agota el CAF: la venta queda sin documento; hoy solo se registra
   en el log.
