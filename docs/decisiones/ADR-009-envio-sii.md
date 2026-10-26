# ADR-009: Envío de boletas a la API del SII (semilla, token, lote y estado)

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25)
- Base: ADR-008 (DTE de boleta), OpenAPI del SII `https://www4c.sii.cl/bolcoreinternetui/api/openapi.yaml` v1.0.5
  y `EnvioBOLETA_v11.xsd`.

## Contexto

La Etapa 1 dejó el DTE de boleta 39/41 firmado y validado contra el schema oficial, pero
aislado. La Etapa 2 cierra el circuito de **envío**: pedir semilla, firmar el `getToken`,
obtener el token, empaquetar uno o más DTE en un `EnvioBOLETA`, subirlo como
`multipart/form-data` y consultar el estado del envío.

La certificación real (certificado, CAF y postulación del dueño) todavía no existe. Todo el
cliente se prueba con `fetch` inyectable y respuestas sintéticas; **nunca** se llama al SII
real desde los tests ni se usan los hosts de producción en desarrollo (CLAUDE.md §2).

## Decisión

Implementar en `packages/dte/src/sii/` dos módulos sin dependencias nuevas:

- **`envio.ts`**: arma y firma el `EnvioBOLETA` de un lote (máximo 50 boletas).
- **`cliente.ts`**: cliente HTTP de la API del SII con `fetch` inyectable.

### `EnvioBOLETA`

- Raíz `<EnvioBOLETA version="1.0" xmlns="http://www.sii.cl/SiiDte">` con declaración
  `<?xml version="1.0" encoding="ISO-8859-1"?>`.
- `<SetDTE ID="SetDoc">` con `<Caratula version="1.0">` y hasta 50 `<DTE>`.
- `Caratula`: `RutEmisor`, `RutEnvia`, `RutReceptor` (`60803000-K`, el SII),
  `FchResol` (AAAA-MM-DD), `NroResol` (0–999999), `TmstFirmaEnv` (hora de Chile) y un
  `SubTotDTE` por tipo presente (39 y/o 41, en ese orden).
- Los `<DTE>` se incrustan **sin** su `xmlns` propio: el namespace ya está declarado en la
  raíz. El DTE se sigue generando con `xmlns` para poder validarse aislado; `envio.ts` lo
  quita al incrustarlo.
- La firma del `<SetDTE>` usa `Reference URI="#SetDoc"` y transformada C14N. El digest se
  calcula sobre `<SetDTE xmlns="http://www.sii.cl/SiiDte" ID="…">…</SetDTE>`.
- Se rechazan lotes vacíos, más de 50 boletas, folios repetidos, fechas de resolución
  inexistentes, números de resolución fuera de rango y caracteres que no se puedan
  representar en ISO-8859-1.

### Firma y C14N (punto delicado)

La firma del `<SetDTE>` incluye la firma interna de cada `<DTE>`. C14N **expande** las
etiquetas autocerradas (`<x/>` → `<x></x>`). Por eso la firma XMLDSig se emite con etiquetas
pares también en su forma literal; si se emitieran autocerradas, el digest calculado sobre
la cadena literal no coincidiría con el que calcula el SII al canonicalizar el documento.
El test `no emite etiquetas autocerradas` protege esta invariante.

Se verificó de forma independiente:

- El `EnvioBOLETA` **valida contra `EnvioBOLETA_v11.xsd`** con `xmllint --schema`.
- El `DigestValue` del `<SetDTE>` coincide con el SHA1 del C14N calculado por
  `libxml2` (`xmllint --c14n`).
- El `SignatureValue` del `<SetDTE>` verifica con `openssl dgst -verify` contra el
  certificado del emisor.
- El `DigestValue` del `<Documento>` de cada DTE sigue coincidiendo tras incrustarlo.

### Cliente HTTP

- **Hosts** (OpenAPI):
  - Certificación: `https://apicert.sii.cl/recursos/v1` (semilla, token, estado) y
    `https://pangal.sii.cl/recursos/v1` (solo `POST /boleta.electronica.envio`).
  - Producción: `https://api.sii.cl/recursos/v1` y `https://rahue.sii.cl/recursos/v1`.
  - `baseApi`/`baseEnvio` permiten sobreescribirlos en tests o proxies.
- **Semilla**: `GET /boleta.electronica.semilla`, respuesta XML con prefijo `SII:`
  (`ESTADO`, `GLOSA`, `SEMILLA`). Se acepta con o sin prefijo.
- **Token**: `POST /boleta.electronica.token` con `Content-Type: application/xml`. El cuerpo
  tiene **exactamente dos líneas** y **sin salto final**:
  1. `<?xml version="1.0" encoding="UTF-8"?>`
  2. `<getToken><item><Semilla>…</Semilla></item><Signature …>…</Signature></getToken>`

  La firma es **envolvente**: `Reference URI=""`, transformada
  `http://www.w3.org/2000/09/xmldsig#enveloped-signature` y digest SHA1 sobre el
  `getToken` sin la firma.
- **Token en las llamadas**: header `Cookie: TOKEN=<token>`. Dura 1 h y se renueva con cada
  uso; el cliente lo cachea 55 min para renovarlo con margen. Ante un 401/403 limpia el
  token, pide uno nuevo y reintenta **una vez**.
- **Envío**: `POST /boleta.electronica.envio` en el host de envío, con
  `multipart/form-data` manual (sin dependencias) y los campos `rutSender`, `dvSender`,
  `rutCompany`, `dvCompany` y `archivo`. El header `User-Agent` es obligatorio. El archivo
  se codifica en **ISO-8859-1**; los RUT van sin puntos y separados en cuerpo/DV.
- **Estado**: `GET /boleta.electronica.envio/{rut}-{dv}-{trackid}` en el host de API.
  Se normalizan `estado` (REC/EPR/CRT/FOK/PRD/RCH/RCO/VOF/RFR/RPR/RPT/RSC/SOK/RCT),
  `estadistica` y `detalle_rep_rech` (con `error[]`).
- **Errores**: se traducen a `ErrorDominio` con códigos estables (`SII_SIN_CONEXION`,
  `SII_HTTP`, `SII_SEMILLA_RECHAZADA`, `SII_TOKEN_RECHAZADO`, `SII_NO_AUTORIZADO`,
  `SII_LIMITE`, `SII_RESPUESTA_INVALIDA`, `TRACKID_INVALIDO`) para que la UI muestre un
  mensaje en español.

## Consecuencias

- `packages/dte` no agrega dependencias: el multipart, el parseo XML acotado y la firma usan
  `node:crypto`/`node:buffer`.
- El cliente **no** se conecta solo: la Etapa 3 (`SiiDirectoProvider`) decide cuándo emitir,
  qué folio usar, cómo encolar offline y cuándo reintentar.
- El token se mantiene en memoria; no se persiste ni se loguea (CLAUDE.md §3).
- El lote máximo es 50 por recomendación del SII, aunque el schema admita 500. Se puede
  subir el límite si la certificación lo confirma.
- Los hosts de producción existen en el código para la puesta en marcha, pero el desarrollo
  y los tests usan certificación o `fetch` falso.

## `TODO(SII)` pendiente de validar en la certificación

1. Confirmar que `RutReceptor` es siempre `60803000-K` y que `RutEnvia` debe ser el RUT
   autenticado (el ejemplo del OpenAPI usa otro RUT).
2. Confirmar que el `EnvioBOLETA` se acepta en ISO-8859-1 con esa declaración y si el SII
   tolera UTF-8.
3. Confirmar los valores reales de `FchResol`/`NroResol` para boletas (resolución de inicio
   de actividades vs. resolución de emisión) y si `NroResol=0` es válido.
4. Confirmar la semántica exacta de renovación del token (¿1 h desde la emisión o desde el
   último uso?) y el rate limit (`X-RateLimit-*`, `X-Retry-After`).
5. Confirmar si el máximo recomendado de 50 boletas por envío sigue vigente y qué pasa con
   el lote al recibir `RPT` (envío repetido).
6. Confirmar el formato de `TmstFirmaEnv` sin offset y el uso de `America/Santiago`.
