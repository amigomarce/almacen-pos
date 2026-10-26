# ADR-008: Generación del DTE de boleta (39/41) desde cero con `node:crypto`

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25)
- Base: Fase 0 (`docs/SII_BOLETA_ELECTRONICA.md` §5) y ADR-001 (Estrategia A).

## Contexto

La Fase 5 implementa `SiiDirectoProvider` (Estrategia A): emitir la boleta con software propio.
La Etapa 1 construye el **núcleo puro** del DTE: XML de boleta 39 (afecta) / 41 (exenta), timbre
electrónico (TED), firma XMLDSig y parseo del CAF con control de folios. Todo debe funcionar
offline y ser testeable sin SII.

## Decisión

Implementar el módulo en `packages/dte/src/sii/` **desde cero**, sin librerías de XML ni de C14N:

- **XML compacto** (`xml.ts`): se genera sin espacios entre etiquetas. La forma "aplanada" del
  `<DD>` y la forma canónica (C14N) del `<Documento>` coinciden con la cadena literal, salvo la
  declaración de namespace que C14N agrega al nodo raíz de la referencia (ver abajo).
- **Criptografía con `node:crypto`**: `RSA-SHA1` y `SHA1` nativos.
- **Fixtures sintéticos** (`test/ayudas.ts`): certificado autofirmado y CAF descartables generados
  en los tests. Nunca se usan credenciales reales (CLAUDE.md §3).

No se añadió librería porque el schema es acotado, el paquete `dte` solo lo consume `apps/server`
(Node) y así controlamos la forma canónica. El bundle del navegador no lo incluye: la caja habla
con el servidor por HTTP.

## Hechos verificados contra el schema oficial de boleta

La boleta **no** usa `DTE_v10.xsd` (ese es el schema de factura: 33/34/46/52/56/61). Usa
`EnvioBOLETA_v11.xsd` (descargado de `schema_envio_bol.zip`), que define su propio
`BOLETADefType`. El formato de referencia es **"Formato Boletas Electrónicas de Ventas y
Servicios" v4.2 (2025-09-08)**.

- **Raíz**: `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">`.
- **IdDoc**: `<TipoDTE>`, `<Folio>`, `<FchEmis>`, `<IndServicio>` (3 = Boleta de Ventas y
  Servicio). **No** lleva `FmaPago` (eso es de factura).
- **Emisor**: `<RUTEmisor>`, `<RznSocEmisor>`, `<GiroEmisor>`, `<DirOrigen>`, `<CmnaOrigen>`.
  **No** lleva `Acteco` (eso es de factura).
- **Receptor**: `<RUTRecep>` (`66666666-6` para consumidor final), `<RznSocRecep>`.
- **Totales**: `<MntNeto>`, `<MntExe>` (si hay exento), `<IVA>`, `<MntTotal>`. **No** lleva
  `TasaIVA`.
- **Detalle**: `<NroLinDet>`, `<IndExe>1</IndExe>` (solo exento), `<NmbItem>`, `<QtyItem>`,
  `<UnmdItem>`, `<PrcItem>`, `<MontoItem>`.
  - `MontoItem` y `PrcItem` son **brutos** (con IVA), porque no se declara `IndMntNeto=2`.
    El formato v4.2 lo dice explícitamente para `PrcItem`.
  - `PrcItem` se **deriva del monto de la línea** (`MontoItem / QtyItem`, hasta 6 decimales) para
    que cuadre también con descuentos y ventas "por monto" (ADR-006). Se omite si el monto es 0
    (el schema exige `≥ 0.000001`).
  - `UnmdItem` es glosa libre de hasta 4 caracteres, "sin validación" según el formato v4.2:
    se usa `UN` y `KG`.
- **TED**: `<TED version="1.0"><DD>…<CAF>…</CAF><TSTED>…</TSTED></DD><FRMT algoritmo="SHA1withRSA">…</FRMT></TED>`.
  El `DD` lleva `RE, TD, F, FE, RR, RSR, MNT, IT1, CAF, TSTED`. La firma `FRMT` es
  **SHA1withRSA sobre el `DD` aplanado, codificado en ISO-8859-1**, con la clave privada del CAF
  (`RSASK`). `RSR` e `IT1` se recortan a 40 caracteres.
- **CAF**: `<CAF version="1.0"><DA>…</DA><FRMA algoritmo="SHA1withRSA">…</FRMA></CAF>` más el
  `<RSASK>`. El elemento `<CAF>` se incrusta **verbatim** en el `DD`. Se valida que el RUT del CAF
  coincida con el del emisor.
- **Firma XMLDSig**: el `<Signature>` es **hermano** del `<Documento>` dentro del `<DTE>`
  (`ref="ds:Signature"` en el schema). `DigestValue` = SHA1 sobre la forma canónica del
  `<Documento>`; `SignatureValue` = RSA-SHA1 sobre la forma canónica de `<SignedInfo>`;
  `KeyInfo` = `RSAKeyValue` + `X509Data/X509Certificate` (ambos obligatorios en
  `xmldsignature_v10.xsd`).

### Namespace y C14N (punto delicado)

En el documento final el `<Documento>` **hereda** el namespace por defecto del `<DTE>`. C14N
declara ese namespace en el nodo raíz de la referencia, así que el digest se calcula sobre:

```
<Documento xmlns="http://www.sii.cl/SiiDte" ID="…">…</Documento>
```

y no sobre la forma literal (que no repite el `xmlns`). Esto se verificó de forma independiente:
el `DigestValue` generado coincide con el SHA1 del C14N calculado por `libxml2`/`xsltproc`, y el
`SignatureValue` verifica con `openssl` contra el C14N del `<SignedInfo>`.

**Invariante para la Etapa 2**: el `EnvioBOLETA` no debe declarar namespaces adicionales en
ancestros del `<DTE>` (por ejemplo `xmlns:xsi`). Si los declara, C14N los incluye en el
`<Documento>` y el digest deja de cuadrar. La alternativa, si se necesitan, es pasarlos a la
firma y canonicalizar con ellos. La Etapa 2 respeta esta invariante y además emite la firma
con etiquetas pares (C14N expande las autocerradas). Ver ADR-009.

## Verificación

- El `<DTE>` generado **valida contra `EnvioBOLETA_v11.xsd`** (con un wrapper que declara
  `DTE` como elemento global del tipo `BOLETADefType`).
- Los tests verifican criptográficamente: `FRMT` contra la clave pública del CAF, y
  `DigestValue`/`SignatureValue` contra el certificado del emisor.
- Se validó además con `xmllint` (schema), `xsltproc` + `xmllint --c14n` (digest) y `openssl
  dgst -verify` (firma).

## Consecuencias

- `packages/dte/tsconfig.json` incluye `types: ["node"]` (usa `node:crypto`).
- `packages/dte` exporta `./sii` desde su índice; no afecta al navegador.
- Las fechas (`FchEmis`, `TSTED`, `TmstFirma`) se formatean en **`America/Santiago`**, no en la
  zona del servidor. Si el servidor corre en UTC, formatear con la hora local desplazaría el día
  cerca de medianoche.
- Los datos legales del emisor se validan contra los largos del schema y **fallan** si no caben
  (razón social 100, giro 80, dirección 70, comuna 20). El nombre del ítem se recorta a 80.
- El control de folios (`EstadoFolios`) es en memoria; la persistencia del "último folio usado"
  queda para la Etapa 3 (proveedor).

## `TODO(SII)` pendiente de validar en el ambiente de certificación

1. ~~Validar el `EnvioBOLETA` completo contra `EnvioBOLETA_v11.xsd` y su firma de `SetDTE` (Etapa 2).~~
   **Hecho en la Etapa 2** (ADR-009): valida con `xmllint --schema`, el digest coincide con
   C14N de `libxml2` y la firma verifica con `openssl`.
2. `UnmdItem`: el formato v4.2 lo declara "sin validación"; confirmar si la validación de negocio
   del SII exige un código específico (p. ej. `KGM`).
3. ~~Serialización final del envío a **ISO-8859-1** con su declaración `encoding` (el fragmento
   `<DTE>` no la lleva; la lleva el archivo `EnvioBOLETA`).~~
   **Hecho en la Etapa 2** (ADR-009): el archivo se declara ISO-8859-1 y el cliente lo codifica
   a bytes Latin-1 antes de enviarlo.
4. Descifrado del `RSASK` real del CAF (los fixtures usan PEM PKCS#1 sin cifrar) y confirmación de
   que el `<RE>` del CAF real viene sin puntos.
5. `TmstFirma`/`TSTED` en hora local sin offset: confirmar que el SII lo acepta así.
6. `IndServicio=3` ("Boleta de Ventas y Servicio") para un almacén: confirmar con el contador.
7. Persistencia y alerta de folios (CAF por agotarse), y renovación de CAF.
8. Revisar si la Res. Ex. 154/2025 (Anexo Técnico v2.5, obligatorio desde 2026-05-01) actualiza
   también el schema de boletas; a la fecha de este ADR la descarga oficial sigue siendo
   `schema_envio_bol.zip` (EnvioBOLETA_v11).
