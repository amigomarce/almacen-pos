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

- **XML compacto** (`xml.ts`): generamos el DTE sin espacios entre etiquetas y sin namespaces en
  el documento interno, de modo que la forma "aplanada" del `<DD>` y la forma canónica (C14N) del
  `<Documento>` coinciden con la cadena literal que firmamos.
- **Criptografía con `node:crypto`**: `RSA-SHA1` y `SHA1` nativos.
- **Fixtures sintéticos** (`test/ayudas.ts`): certificado autofirmado y CAF descartables generados
  en los tests. Nunca se usan credenciales reales (CLAUDE.md §3).

No se añadió librería porque: el schema es fijo y acotado, el DTE interno no tiene namespaces (se
firma aislado antes de incrustarse en `EnvioBOLETA`), y así controlamos la forma canónica. El
paquete `dte` solo lo consume `apps/server` (Node); no entra al bundle del navegador (la caja habla
con el server por HTTP).

## Hechos técnicos verificados (DTE_v10.xsd y referencia XML-DSIG/SII)

- Emisor: `<RUTEmisor>`, `<RznSoc>`, `<GiroEmis>`, `<Acteco>`, `<DirOrigen>`, `<CmnaOrigen>`.
- Receptor: `<RUTRecep>`, `<RznSocRecep>` (boleta a consumidor final: `66666666-6`).
- `IdDoc`: `<TipoDTE>`, `<Folio>`, `<FchEmis>`, `<FmaPago>1</FmaPago>`.
- `Totales`: `<MntNeto>`, `<MntExe>`, `<TasaIVA>`, `<IVA>`, `<MntTotal>` (41 no lleva neto/IVA).
- `Detalle`: `<NroLinDet>`, `<IndExe>1</IndExe>`, `<NmbItem>`, `<QtyItem>`, `<UnmdItem>`,
  `<PrcItem>`, `<MontoItem>`.
- **TED**: `<TED version="1.0"><DD>…<CAF>…</CAF><TSTED>…</TSTED></DD><FRMT algoritmo="SHA1withRSA">…</FRMT></TED>`.
  El `DD` lleva `RE, TD, F, FE, RR, RSR, MNT, IT1, CAF, TSTED`. La firma `FRMT` es **SHA1withRSA
  sobre el `DD` aplanado, codificado en ISO-8859-1**, con la clave privada del CAF (`RSASK`).
- **CAF**: `<CAF version="1.0"><DA>…</DA><FRMA algoritmo="SHA1withRSA">…</FRMA></CAF>` más el
  `<RSASK>` (clave privada). El elemento `<CAF>` se incrusta **verbatim** en el `DD`.
- **Firma XMLDSig**: `DigestValue` = SHA1 sobre la forma canónica del `<Documento>` en UTF-8;
  `SignatureValue` = RSA-SHA1 sobre el `<SignedInfo>` canónico en UTF-8, con el certificado del
  emisor. El `<Documento>` se referencia por su atributo `ID` (xs:ID).

## Consecuencias

- `packages/dte/tsconfig.json` ahora incluye `types: ["node"]` (usa `node:crypto`).
- `packages/dte` exporta `./sii` desde su índice; no afecta al navegador (solo lo importa el server).
- El control de folios (`EstadoFolios`) es en memoria; la persistencia del "último folio usado"
  queda para la Etapa 3 (proveedor).

## `TODO(SII)` pendiente de validar en el ambiente de certificación

1. Validar el XML generado contra `DTE_v10.xsd` y `EnvioBOLETA_v11.xsd` reales.
2. `UnmdItem`: confirmar el código oficial de unidad ("KGS" vs "KG").
3. `PrcItem`/`MontoItem`: confirmar si el precio debe ser el neto para que `QtyItem × PrcItem ==
   MontoItem`, y el desfase de $1 en ventas "por monto" (ADR-006).
4. Serialización final a ISO-8859-1 (el archivo y el body HTTP), con su declaración `encoding`.
5. Desencriptar el `RSASK` real del CAF del SII (los fixtures usan PEM sin cifrar; verificar el
   esquema de cifrado del CAF entregado por sii.cl).
6. Confirmar que el CAF real viene en `<AUTORIZACION>` con `<RSASK>` en PEM PKCS#1.
7. `FmaPago=1` en boletas (contado) y los campos opcionales que el SII exige en la práctica.
