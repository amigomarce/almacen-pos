# SII — Boleta electrónica

> Estado: **Fase 0 completada y aprobada** (25-oct-2026). Hallazgos en §5, decisión
> aprobada en `docs/decisiones/ADR-001-estrategia-sii.md`. Lo que sigue marcado "verificar" o
> `TODO(SII)` está listado en §6.
>
> ⚠️ **Corrección importante (Fase 0):** la Res. Ex. 12/2025 descrita abajo fue **dejada sin
> efecto** por la **Res. Ex. 53/2025** (29-abr-2025): hoy la boleta se entrega **impresa o
> virtual**. Además, la **Res. Ex. 207/2025** hizo **opcional imprimir el timbre** desde el
> 1-ene-2026. Ver §5, P5 y P12. El texto de §1–§3 se conserva como registro histórico.

## 1. Lo que ya sabemos (con fuente)

- ~~**Obligación de entregar boleta impresa** (Res. Ex. SII N°12 de 2025)~~ — **derogada, ver §5 P12**: desde el 1-may-2025
  los comercios con dispositivos que permitan imprimir deben imprimir siempre la boleta
  electrónica en pagos en efectivo o transferencia; en pagos con tarjeta, la boleta y/o el
  voucher según el modelo de emisión. El envío digital (WhatsApp/correo) es adicional y no
  reemplaza la impresa. Plazo para quienes no tenían impresora: 1-mar-2026 (ya vencido).
  Fuente: https://www.sii.cl/noticias/2025/270225noti01aav.htm ,
  https://www.sii.cl/noticias/2025/200125noti01pcr.htm
  → **El POS debe imprimir la boleta en cada venta pagada en efectivo/transferencia.**
- **Tipos de documento**: Boleta electrónica afecta = DTE **39**; boleta exenta = DTE **41**.
- **Envío de boletas al SII por API REST** (separado de la factura electrónica, que usa SOAP).
  Documentación oficial: https://www4c.sii.cl/bolcoreinternetui/api/
  Instructivo: https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf
  Servicios: semilla, token, envío, consulta estado de envío, consulta de boleta.
- **Hosts** (según ejemplos públicos; verificar en la doc oficial):
  | Uso | Certificación | Producción |
  |---|---|---|
  | Semilla/Token | `apicert.sii.cl/recursos/v1/boleta.electronica.semilla` / `.token` | `api.sii.cl/...` |
  | Envío (multipart, XML `EnvioBOLETA`) | `pangal.sii.cl` | `rahue.sii.cl` |
  | Consultas | `apicert.sii.cl` | `api.sii.cl` |
  El token se obtiene firmando la semilla con el certificado digital y se envía como cookie `TOKEN=...`.
- **Registro de Ventas Diarias (RVD, ex RCOF)**: según proveedores, se envía diariamente
  cuando se emite con software de mercado/propio. **Verificar si sigue vigente en 2026.**
- **Para emitir directo contra el SII** con software propio se requiere: empresa autorizada
  como emisor electrónico, **certificado digital** del representante, **CAF** (folios
  autorizados descargados del SII) y pasar el **proceso de certificación** (set de pruebas,
  simulación, muestras impresas, declaración de cumplimiento).
- Librerías de referencia (open source, para estudiar estructura de XML, TED y firma):
  LibreDTE (PHP), módulo `l10n_cl_fe` de Odoo (Python). No copiar código sin revisar licencia (AGPL/GPL).

## 2. Las tres estrategias posibles

| | A. SII directo (software propio) | B. Proveedor de DTE con API | C. Facturador gratuito SII / POS con boleta incluida |
|---|---|---|---|
| Qué es | Nosotros generamos XML, timbre, firma y enviamos | Proveedor (LibreDTE, SimpleAPI, OpenFactura, Facto, etc.) timbra y envía; nosotros llamamos su API | El dueño usa la app del SII o el POS de tarjetas (algunos emiten boleta) |
| Costo | Sin mensualidad, mucho desarrollo | Mensualidad/por documento | Gratis / incluido |
| Certificación | **Sí**, nosotros (largo) | No (el proveedor ya está certificado), o simplificada | No |
| Offline | Sí (con CAF local) | Depende del proveedor | Depende |
| Integración POS | Total | Total | Mala (doble digitación) |

**Recomendación inicial (a validar)**: arrancar con **B** detrás de la interfaz
`DocumentoTributarioProvider`, y dejar **A** como objetivo a mediano plazo.

### Estrategia D — "Modo puente" (transitoria, solo piloto)

Para operar legalmente mientras se resuelve A o B, sin bloquear el desarrollo del POS.

- Nuestra app registra la venta, descuenta stock y muestra el **total en grande** con el
  aviso "Emita la boleta en el sistema del SII por $X".
- El cajero emite la boleta por ese total en el **emisor gratuito del SII** (app o web),
  en el celular o en otra pestaña. Si pagan con tarjeta y el POS de tarjetas emite boleta,
  se usa ese documento.
- Opcional: campo para anotar el **folio emitido** en la venta → permite cuadrar en el
  cierre de caja (ventas sin folio = alerta).
- Implementación: `PuenteManualProvider` (implementa `DocumentoTributarioProvider`; no
  timbra, solo registra folio externo). El comprobante interno impreso por la caja debe
  decir "NO VÁLIDO COMO BOLETA".

**Descartado: automatizar (RPA) el emisor gratuito del SII.** Controlar la web/app del SII
con un navegador automatizado para emitir la boleta sería frágil (cambios de interfaz,
captchas, sesiones), no funciona sin internet, es lento en caja, exige guardar la
**clave tributaria** del dueño (riesgo alto: da acceso a casi todos sus trámites) y
posiblemente infringe los términos de uso del SII. No implementar salvo que la Fase 0
demuestre lo contrario (ver pregunta 11) y el usuario lo apruebe en un ADR.

## 3. Elementos de la boleta impresa (verificar formato oficial)

Razón social, RUT, giro, dirección del emisor; tipo y folio ("BOLETA ELECTRÓNICA N°…");
fecha; detalle; total; IVA incluido (verificar si es obligatorio desglosar el IVA en boleta
según la normativa vigente — Ley 21.398 / "transparencia de IVA"); **timbre electrónico PDF417**;
leyenda de verificación ("Verifique documento en www.sii.cl"); resolución SII.

## 4. FASE 0 — Tareas de investigación (obligatorias antes de codificar el módulo)

Claude Code: usa búsqueda web y lee **fuentes oficiales del SII** primero. Para cada punto,
anota respuesta + URL + fecha de consulta en este archivo (§5).

1. Descargar y leer la documentación vigente de la API REST de boleta
   (`www4c.sii.cl/bolcoreinternetui/api/`) y el instructivo técnico. Confirmar endpoints,
   formato de autenticación, límites, códigos de respuesta y schemas XSD vigentes (`EnvioBOLETA`).
2. Confirmar si el **RVD/RCOF** sigue siendo obligatorio y su formato.
3. Describir el **proceso de certificación** paso a paso para boleta (sets de prueba,
   plazos, quién lo hace) y requisitos del contribuyente (inicio de actividades, autorización
   como emisor, certificado digital: dónde comprarlo y costo aproximado).
4. Plazo legal para **enviar** la boleta al SII tras emitirla (para dimensionar el modo offline).
5. Requisitos de la **representación impresa** (contenido mínimo, tamaño del timbre, papel térmico 58/80 mm).
6. **Anulación/devoluciones** en boleta: ¿nota de crédito (DTE 61)? ¿cómo lo hace un almacén?
7. Impuestos adicionales en boleta (ILA, bebidas azucaradas): ¿se detallan en boleta o no?
8. Normativa vigente de **redondeo de efectivo** (Ley 20.956) y cómo se refleja en la boleta.
9. Relación boleta ↔ voucher cuando el pago es con tarjeta (Res. 12/2025): ¿basta el voucher
   si el POS de tarjetas ya emite boleta? ¿cómo evitar doble boleta?
10. Comparar **al menos 4 proveedores** de DTE con API para boleta: precio por documento /
    mensual, si permiten timbrar offline con CAF local, SDK/REST, ambiente de pruebas,
    soporte a ESC/POS/PDF417. Tabla comparativa.
11. Revisar los **términos de uso** de los sistemas del SII (sitio web y emisor gratuito de
    boleta): ¿permiten acceso automatizado? ¿Existe alguna API oficial para el emisor
    gratuito? Confirmar cómo funciona hoy ese emisor (app/web, si exige detalle o solo
    monto, cómo se imprime) para diseñar bien la Estrategia D.
12. Evaluar si la **Estrategia D** cumple la obligación de entregar boleta impresa
    (Res. Ex. 12/2025) cuando el emisor gratuito se usa desde el celular sin impresora.
13. Proponer la estrategia (A/B/C/D o mixta) en `docs/decisiones/ADR-001-estrategia-sii.md`
    con pros/contras y costos, y **esperar aprobación del usuario**.

## 5. Hallazgos de la Fase 0

Fecha de consulta de todas las fuentes: **24–25 de octubre de 2026**, salvo que se indique
otra. "Oficial" = sii.cl o documento firmado por el SII; "proveedor" = blog/sitio comercial
(menor confianza, usar solo como indicio).

### Resumen de normativa vigente (cadena de resoluciones)

| Norma | Qué dice (resumido) | Estado |
|---|---|---|
| Ley 21.210 (2020) | Boleta electrónica obligatoria; IVA desglosado. | Vigente |
| Res. Ex. 74/2020 | Procedimiento de boleta electrónica: CAF, envío al SII ≤ 1 h, NC para anular, representación impresa/virtual, conservación 6 años. | Vigente, modificada por 53/2022, 53/2025 y 207/2025 |
| Res. Ex. 176/2020 + 76/2021 | Voucher de tarjeta "Válido como boleta"; declaración de **modelo de emisión**. | Vigente (76/2021 modificada por 53/2025) |
| Res. Ex. 53/2022 | **Elimina el RVD** (Resumen de Ventas Diarias) desde ago-2022. | Vigente |
| Res. Ex. 12/2025 | Boleta impresa obligatoria + afiche. | **Derogada** por 53/2025 desde 1-may-2025 |
| Res. Ex. 53/2025 | Entregar boleta/voucher **impreso o virtual** en ventas presenciales. | Vigente |
| Res. Ex. 207/2025 | Desde 1-ene-2026 imprimir el **timbre es opcional**; el TED sigue obligatorio en el XML. | Vigente |
| Res. Ex. 2/2026 | Firma digital centralizada en el sistema gratuito del SII (no requiere certificado propio). | Vigente |

---

**P1. API REST de boleta: endpoints, autenticación, límites, códigos, XSD.**
- Spec oficial OpenAPI 3.0.1, "API SII – V1", versión **1.0.5**, servida en
  `https://www4c.sii.cl/bolcoreinternetui/api/openapi.yaml` (la página HTML es un Swagger UI
  que la carga). Servidores declarados:
  | Uso | Certificación | Producción |
  |---|---|---|
  | Semilla, token, consultas | `https://apicert.sii.cl/recursos/v1` | `https://api.sii.cl/recursos/v1` |
  | Solo `POST /boleta.electronica.envio` ("Temporal") | `https://pangal.sii.cl/recursos/v1` | `https://rahue.sii.cl/recursos/v1` |
- Recursos:
  - `GET /boleta.electronica.semilla` → XML con SEMILLA, **dura 2 minutos**.
  - `POST /boleta.electronica.token` → se envía XML `getToken` con la semilla firmada
    (XMLDSig) con el certificado digital. El token **dura 1 hora y se renueva con cada uso**;
    se recomienda reutilizarlo, no pedir uno por envío. La spec advierte que "en el futuro va
    a cambiar" esta forma de autenticación.
  - `POST /boleta.electronica.envio` → `multipart/form-data` con `rutSender`, `dvSender`,
    `rutCompany`, `dvCompany`, `archivo` (XML `EnvioBOLETA` firmado). Header obligatorio
    `User-Agent` y `Cookie: TOKEN={token}`. Respuesta JSON con `trackid` (**15 dígitos**).
  - `GET /boleta.electronica.envio/{rut}-{dv}-{trackid}` → estado del envío: `REC`, `SOK`,
    `FOK`, `PRD`, `CRT`, `EPR` (procesado), `RPR` (aceptado con reparos), `RCH`, `RCO`,
    `RFR` (firma), `RSC` (schema), `RCT` (carátula), `RPT` (repetido), `VOF`; más
    estadística por tipo (informados/aceptados/rechazados/reparos) y detalle de errores.
  - `GET /boleta.electronica/{rut}-{dv}-{tipo}-{folio}/estado?rut_receptor&dv_receptor&monto&fecha` → estado de una boleta.
  - `GET /globales/...` → catálogos (estados, tipos 39/41, niveles y secciones de error).
- Códigos HTTP: 200 OK, 400 petición con error, 401 no autorizado (falta TOKEN), 404,
  **405 = límite excedido**, 500. Headers de rate limit: `X-RateLimit-Limit` (requerimientos
  por hora), `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-Retry-After`. No se publica el
  número del límite.
- Recomendaciones oficiales (05-may-2021, dentro de la spec): agrupar **~50 boletas por
  envío** (máximo **500** por envío según el instructivo), esperar **~10 minutos** antes de
  consultar el estado, no abusar de envíos por IP.
- Schemas: `http://www.sii.cl/factura_electronica/factura_mercado/schema_envio_bol_720.zip`;
  formato de campos: `boletas_elec_020.pdf` (**v2.22, 2020-07-20**). Instructivo técnico
  (28-oct-2021): **TLS 1.2 o superior** obligatorio; la boleta usa REST, la factura sigue en SOAP.
- Fuentes (oficiales): https://www4c.sii.cl/bolcoreinternetui/api/openapi.yaml ·
  https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf ·
  http://www.sii.cl/factura_electronica/factura_mercado/boletas_elec_020.pdf

**P2. ¿Sigue vigente el RVD/RCOF?**
- **No.** La Res. Ex. 53 (09-jun-2022) eliminó la obligación de generar y enviar el Resumen
  de Ventas Diarias para **todos** los emisores de boleta electrónica desde **agosto de 2022**.
  El SII llena el Registro de Compras y Ventas automáticamente con las boletas recibidas;
  las correcciones se hacen **reenviando boletas**, no editando el registro. Sigue exigible
  para periodos anteriores a ago-2022 (irrelevante para nosotros).
- Nota: algunas FAQ del SII (p. ej. 001_380_7667) todavía mencionan el RVD; están desactualizadas
  respecto de la resolución.
- Fuentes (oficiales): https://www.sii.cl/normativa_legislacion/resoluciones/2022/reso53.pdf ·
  https://www.sii.cl/noticias/2022/160622noti01rp.htm · https://www.sii.cl/noticias/2022/040822noti01rp.htm
- **Consecuencia: no implementar RVD.**

**P3. Proceso de certificación y requisitos del contribuyente.**
- Requisito base: **inicio de actividades en 1ª categoría vigente** (FAQ 001_380_7799, act. 22-jul-2026).
  Ya **no** es obligatorio estar inscrito en factura electrónica para emitir boletas.
- Con software propio o de mercado (FAQ 001_380_7667, act. 20-jul-2026):
  1. El **representante legal** postula (autenticado con certificado digital) y descarga el
     **set de pruebas** de boleta en sii.cl → Servicios online → Factura electrónica.
  2. Siguiendo las instrucciones del correo, descarga folios (CAF) de certificación, genera
     los archivos y los envía (guía de boletas: **5 envíos** a `SII_BE_Certificacion@sii.cl`
     con asunto que identifique set, empresa y RUT).
  3. Solicita la revisión. **Plazo de revisión: 10 a 15 días hábiles.**
  4. Con el V°B° hace la **declaración de cumplimiento** → queda autorizado.
  - El SII elimina del ambiente de certificación a quien no tenga actividad en **6 meses**.
  - La representación impresa debe mostrar el sitio de verificación.
- Para factura electrónica el proceso tiene 6 etapas (set de pruebas, simulación,
  intercambio, muestras impresas, declaración, registro); para **boleta** el proceso es el
  reducido de arriba.
- **Certificado digital**: personal (de la persona, no de la empresa), archivo `.pfx`, emitido
  por entidades acreditadas (Ley 19.799): E-certchile, Acepta, e-Sign, etc. Precio indicativo:
  **~$12.000–$25.000 + IVA por año** (Haulmer/OpenFactura lo vende en $11.790 + IVA por 1 año,
  $16.790 por 2 y $19.790 por 3; guía de Simplo estima $15.000–$25.000 + IVA). Verificar
  precio con la entidad al comprar.
- **No se necesita certificado** para el sistema gratuito del SII (FAQ 001_380_7800 y Res. 2/2026).
- Fuentes (oficiales): https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7667.htm ·
  https://www.sii.cl/factura_electronica/guia_emitir_boleta_servicio.htm ·
  https://www.sii.cl/factura_electronica/factura_mercado/proceso_certificacion.htm ·
  https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7799.htm ·
  https://www.chileatiende.gob.cl/fichas/3007 · (precios, proveedor) https://www.openfactura.cl/ ,
  https://simplo.cl/articulo-certificado-digital/

**P4. Plazo para enviar la boleta al SII (dimensiona el modo offline).**
- Res. Ex. 74/2020, letra F N°6: enviar "de manera inmediata, con un **plazo máximo de 1 hora**".
  **Sin cobertura de datos** se autoriza a **generar las boletas sin enviarlas** y el plazo de
  1 hora corre **desde que se restablece la conexión**.
- Además: cada folio se usa una sola vez; los folios que no se usarán deben **anularse**;
  conservar el XML **6 años**; entregar la boleta al cliente de inmediato.
- Fuente (oficial): https://www.sii.cl/normativa_legislacion/resoluciones/2020/reso74.pdf
- **Consecuencia:** el modo offline con CAF local es legal. La cola debe reintentar en cuanto
  vuelva la red y despachar todo en < 1 h (alerta si una boleta lleva > 45 min pendiente con red).

**P5. Representación impresa: contenido, timbre, papel.**
- Res. 74/2020 letra G (texto vigente tras 53/2025): representación **virtual** mínima:
  nombre del documento ("Boleta Electrónica" / "Boleta No Afecta o Exenta Electrónica"),
  folio, fecha, datos del emisor, **monto IVA**, monto total.
- Representación **impresa**: nombre del documento; timbre electrónico en la parte inferior o
  reverso; bajo él "Timbre electrónico SII" y "verifique en www.sii.cl"; **papel de ancho
  mínimo 5,7 cm** (→ 58 mm sirve, 80 mm también); **timbre mínimo 2 × 4,5 cm**, generado a
  **> 200 dpi**; los datos de Anexo 1 (formato boleta) marcados como de impresión.
- **Res. Ex. 207/2025: desde el 1-ene-2026 imprimir el timbre es OPCIONAL**; el TED sigue
  siendo obligatorio dentro del XML.
- Fuentes (oficiales): https://www.sii.cl/normativa_legislacion/resoluciones/2020/reso74.pdf ·
  https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso207.pdf ·
  https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso53.pdf
- **Consecuencia:** se puede imprimir boleta válida sin PDF417. Recomendación: imprimirlo
  igual cuando se tenga (permite al cliente verificar) y respetar 2 × 4,5 cm y > 200 dpi;
  pero no es bloqueante. En 58 mm (≈ 48 mm imprimibles) el timbre cabe a lo ancho.

**P6. Anulaciones y devoluciones.**
- Res. 74/2020 letra F N°7–9: para **anular** una boleta → **nota de crédito electrónica**
  (DTE 61). Descuentos o cambios de datos posteriores → NC. Cambio de mercadería por uno de
  **menor** valor → NC por la diferencia; por uno de **mayor** valor → **nueva boleta** por la
  diferencia referenciando la original. No se puede "corregir" el monto de una boleta.
- FAQ 001_380_7812 (act. 23-jul-2026): si el contribuyente **no es facturador electrónico**,
  la NC se emite **desde el sitio web del SII** (aplicativo para emisores que solo emiten
  boletas, firmado con firma centralizada según Res. 2/2026); si es facturador, desde el
  sistema gratuito o su software.
- Si la NC cae en un periodo ya declarado hay que rectificar el F29.
- Fuentes (oficiales): https://www.sii.cl/normativa_legislacion/resoluciones/2020/reso74.pdf ·
  https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7812.htm ·
  https://www.sii.cl/normativa_legislacion/resoluciones/2026/reso2.pdf
- **Consecuencia para el almacén:** las anulaciones son raras. La "anulación" en la caja se
  registra internamente (stock + caja) y la NC se emite: (a) por el provider si emite DTE 61,
  o (b) manualmente en el sitio del SII (MVP). El sistema debe recordarlo en el cierre de caja.
  Ojo: la NC (DTE 61) es un DTE de la familia factura (envío SOAP/`EnvioDTE`), no va por la API
  de boletas; emitirla con software propio exige certificar DTE 61. `TODO(SII)`: confirmar.

**P7. Impuestos adicionales (ILA, bebidas azucaradas).**
- Res. 74/2020 F N°4 y FAQ 001_380_7672 (act. 14-jul-2026): se desglosa **IVA** y solo los
  impuestos del **art. 37 letras a), b) y c)** de la Ley de IVA (artículos suntuarios: joyas,
  pieles, etc.).
- Oficio Ord. N°6 de la DR Los Ríos (11-ene-2021): el **ILA** (art. 42 y ss.) **no** se
  desglosa en la boleta electrónica.
- Bebidas analcohólicas/azucaradas: también están en el **art. 42** → por la misma lógica
  **no se desglosan**. `TODO(SII)`: no hay pronunciamiento específico encontrado.
- En el XML existe el subtotal informativo `SubTotAdicSTI`, obligatorio solo para art. 37.
- Fuentes (oficiales): https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7672.htm ·
  https://www.sii.cl/documentos/normativa_ddrr/2021/los_rios/ordinario6_62033.pdf
- **Consecuencia:** el almacén no necesita desglosar ILA ni impuesto a bebidas en la boleta.
  `extra_tax_code` en `products` sirve para reportes, no para la boleta (por ahora).

**P8. Redondeo de efectivo (Ley 20.956, art. 13).**
- En **pagos en efectivo**, el total se redondea a la decena: terminaciones **1–5 bajan**,
  **6–9 suben** (ojo: el 5 baja). **No** aplica a transferencias, cheques ni tarjetas.
- "Esta operación **no generará efecto tributario** alguno y **no deberán modificarse los
  documentos tributarios**": la boleta lleva el **total exacto**; el redondeo afecta solo lo
  cobrado en efectivo (y el vuelto).
- Fuentes (secundarias que citan la ley: SUSESO, Municipalidad de Providencia):
  https://www.suseso.cl/613/alt-propertyvalue-63802.pdf ·
  https://www.sinim.gov.cl/archivos/home/628/NSPM.0111_MUNICIPALIDAD_DE_PROVIDENCIA_AJUSTE_DE_SENCILLO.pdf
  Revisado en Fase 1 (2026-10-25): la transcripción de SUSESO cita el art. 13 textual ("las
  cantidades iguales o inferiores a $5 se depreciarán a la decena inferior, y las cantidades
  iguales o superiores a $6 se elevarán a la decena superior"). LeyChile no se pudo abrir sin
  navegador. `TODO(SII)`: cotejar con el texto oficial en bcn.cl cuando sea posible.
  Implementado en `packages/core/src/pago.ts`.
- **Consecuencia:** `sales.rounding_clp` se guarda aparte; `tax_documents` usa el total sin
  redondear. En el ticket se puede mostrar "Redondeo efectivo: -$3" fuera del bloque tributario.

**P9. Boleta vs. voucher de tarjeta (¿cómo evitar doble boleta?).**
- Art. 54 Ley IVA + Res. 176/2020 modificada por Res. 76/2021: el **voucher** de un pago
  electrónico tiene **valor de boleta** ("Válido como Boleta", RUT y razón social, domicilio,
  fecha, monto, **IVA separado**, total).
- **Modelo de emisión** (Res. 76/2021): si el contribuyente **no declara nada**, se entiende que
  emite boleta solo por pagos no electrónicos y que en pagos con tarjeta **el voucher es la
  boleta**. Si quiere emitir boleta en todo pago, debe declarar en sii.cl → Boleta de Ventas y
  Servicios Electrónica → **"Declaración de Modelo de Emisión"** (así el SII no cuenta dos veces).
- Si sin declarar emite boleta **y** voucher para la misma venta, debe emitir **una NC mensual**
  a su nombre por el total duplicado (último día del mes, antes del F29).
- Res. 53/2025: con tarjeta se entrega boleta **o** voucher (impreso o virtual) según el modelo.
- Fuentes (oficiales): https://www.sii.cl/normativa_legislacion/resoluciones/2021/reso76.pdf ·
  https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso53.pdf
- **Consecuencia:** configuración por local `modelo_emision`: `SOLO_NO_ELECTRONICOS` (por
  defecto: boleta solo en efectivo/transferencia; tarjeta → voucher) o `TODO_MEDIO_PAGO`
  (boleta siempre; exige la declaración en sii.cl). Con POS de tarjeta externo, el modo por
  defecto evita la doble boleta y **reduce mucho el volumen** de boletas emitidas.

**P10. Proveedores de DTE con API.** Ver tabla comparativa en ADR-001. Resumen:
- **OpenFactura (Haulmer)**: Pyme $360.000 + IVA/año (pago inicial $371.790 + IVA), API
  ilimitada, todos los DTE (39, 41, 61…). Sandbox `dev-api.haulmer.com` (header `apikey`);
  la respuesta trae `TIMBRE`, `XML`, `PDF`, `FOLIO`. Offline: no documentado (nube).
  https://www.openfactura.cl/factura-electronica/precios/ · https://www.openfactura.cl/factura-electronica/api/
- **LibreDTE (SASCO)**: "Servicio Plus" **$40.000 neto/mes hasta 2.000 documentos + $15 por
  documento extra**; API REST; prueba 10 días; el usuario sube sus CAF. Su librería PHP es
  AGPL-3.0 (no reutilizable en código cerrado). https://www.libredte.cl/
- **SimpleAPI (ChileSystems)**: API para **generar, timbrar, firmar y enviar** DTE con el
  certificado y CAF **del cliente** ("sin intermediarios ni almacenamiento de tus datos").
  Planes anuales: gratis 12 meses (500 consultas/mes), **5 UF** (10.000/mes), 9 UF (50.000/mes),
  12 UF (150.000/mes); **código fuente 70 UF** pago único para instalar en servidor propio.
  SDK .NET. Es en la práctica un "software propio asistido" (la certificación es nuestra).
  https://www.simpleapi.cl/precios
- **Facto**: planes anuales según venta mensual: Micro **$290.000 + IVA/año** (hasta
  $25 MM/mes, incluye boleta), Pequeña $490.000 (hasta $75 MM/mes); API incluida en el plan;
  cobro adicional por habilitar/certificar boleta; credenciales sandbox públicas.
  https://www.facto.cl/precios · https://facto.cl/producto/integracion-facto-api/
- **Lioren**: módulo API se cotiza aparte; habilitación SII hasta 15 días. Precios no
  visibles (página sin datos). https://www.lioren.cl/precios
- Ninguno de los proveedores en la nube documenta **timbraje offline**. Solo hay offline real
  si el CAF y la firma están en el equipo del local (estrategia A, o SimpleAPI código fuente).

**P11. Términos de uso del SII y emisor gratuito.**
- Términos del sitio (sin fecha visible), §4: "Se prohíbe el uso de **mecanismos automáticos**
  que puedan obstaculizar las funcionalidades de la plataforma"; §7: no usar sistemas que
  accedan al contenido desde otros sitios. La API de boletas tiene sus propios términos: el SII
  puede suspender el acceso ante uso anormal o para fines distintos a la integración de
  sistemas de emisión.
- **No existe API oficial para el emisor gratuito.** La API REST es solo para sistemas propios
  o de mercado (envío, consulta).
- Emisor gratuito (Sistema de Emisión de Boletas del SII):
  - Web (requiere internet) y **app móvil e-Boleta**, que **permite emitir con intermitencia o
    sin conexión** (FAQ 001_380_7801, act. 22-jul-2026).
  - No requiere certificado digital: firma centralizada (Res. 2/2026). Solo inicio de
    actividades vigente; usable ~3 horas después de inscribirse.
  - Tiene "calculadora" opcional para obtener el total (FAQ 001_380_8144) → en la práctica se
    puede emitir por monto total. `TODO(SII)`: confirmar si permite boleta sin detalle de ítems.
  - Desde sep-2024 la app envía la boleta como adjunto al cliente; impresión vía app de
    impresión Bluetooth (p. ej. RawBT) según usuarios/vendedores (no oficial).
  - **Regla clave (FAQ 001_380_7803, act. 22-jul-2026): un contribuyente debe usar un
    ÚNICO sistema de boletas**: o el del SII, o un software propio/de mercado. Cambiar exige
    desinscribirse (FAQ 001_380_7816 / 7818).
- Fuentes (oficiales): https://www.sii.cl/sobre_el_sii/terminos_sitio_web.html ·
  https://www.sii.cl/servicios_online/3532-3810.html ·
  https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/arbol_faqs_bol_electr_vtas_serv_2288.htm ·
  https://www.sii.cl/noticias/2024/090924noti01aav.htm
- **Consecuencia:** confirmado el descarte de RPA. La Estrategia D y las A/B son
  **excluyentes en el tiempo** (no se pueden usar a la vez en el mismo RUT).

**P12. ¿La Estrategia D cumple la obligación de entrega?**
- La premisa cambió: la Res. 12/2025 (impresa obligatoria) fue **derogada** por la
  **Res. Ex. 53/2025** (29-abr-2025). Hoy se debe entregar la boleta **impresa o virtual**
  (correo, SMS, mensajería, **fotografía**, NFC, QR…), y el comercio debe poder mostrar las
  boletas emitidas ante una fiscalización. Vigencia: 1-may-2025 (con impresora) y 1-mar-2026
  (otros dispositivos) — ambas ya cumplidas. La obligación del afiche de la Res. 12 cayó con ella.
  El consumidor que no exige ni recibe la boleta también puede ser sancionado (art. 97 N°19).
- **Sí, D cumple**: el cajero emite en la app e-Boleta y la entrega virtual (adjunto/foto/QR)
  o impresa (impresora Bluetooth). El comprobante interno de nuestra caja **no** es la boleta.
- Fuentes (oficiales): https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso53.pdf ·
  https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso12.pdf

**P13. Estrategia propuesta:** ver `docs/decisiones/ADR-001-estrategia-sii.md`.

**Otros hallazgos útiles**
- Res. Ex. 99/2026 (27-jul-2026): por catástrofe (sistema frontal) se autorizan documentos
  en **papel** por 12 meses en 10 regiones (Atacama a Los Ríos, incluida la RM). Es una
  contingencia legal ante caídas masivas; no cambia el diseño.
- Ninguna resolución de 2026 revisada (2, 5, 99, 110, 111, 121) cambia el formato de la boleta
  ni la API. Índice: https://www.sii.cl/normativa_legislacion/resoluciones/2026/res_ind2026.htm

**Cambio de sistema de boletas en ambos sentidos** (consultado 2026-10-25)
- **Salir del sistema gratuito (D → A)**: no se hace en línea. Se presenta el
  **Formulario N° 2117** en la Dirección Regional o Unidad del SII del domicilio, y en
  paralelo se habilita el otro software. No se indica plazo.
  https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7816.htm (act. 23/07/2026)
- **Volver al sistema gratuito (A → D)**: inscripción **en línea** en sii.cl (Servicios
  online → Boletas electrónicas); se sugiere avisar al proveedor del software anterior.
  La habilitación tarda **máximo 3 horas**.
  https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7818.htm ·
  https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_8145.htm
- Consecuencia: volver de A a D es rápido y seguro, pero **no sirve como contingencia
  de un día**, porque regresar luego a A exige otra vez el F2117 presencial.

## 6. Preguntas abiertas

Para el usuario / almacén piloto:
- ¿El almacén piloto ya está autorizado como emisor de boleta electrónica? ¿Qué usa hoy
  (e-Boleta del SII, POS de tarjetas, otro software)? — define cómo arranca la Estrategia D.
- ¿Tiene certificado digital vigente? (necesario solo para A/B).
- ¿Qué POS de tarjetas usa (Transbank, Getnet, SumUp, Mercado Pago…)? ¿Su voucher dice
  "Válido como boleta"? ¿Declaró modelo de emisión en sii.cl?
- ¿Cuántas ventas por día tiene, y qué % se paga con tarjeta? (define el volumen de boletas
  y el costo de los proveedores que cobran por documento).
- ¿Qué tan estable es el internet del local? (pesa a favor de A).

Normativa pendiente de confirmar (`TODO(SII)`):
- NC (DTE 61) que anula una boleta, emitida con software propio: ¿requiere certificar DTE 61
  y envío por `EnvioDTE`/SOAP? ¿Se puede seguir usando el aplicativo web del SII aunque las
  boletas se emitan con software propio?
- Estrategia D (e-Boleta): ¿cómo se anula una boleta emitida en la app e-Boleta cuando la venta
  se anula en la caja? ¿Nota de crédito en el sitio del SII, en la misma app, o basta otra vía?
  Hoy la caja muestra "anúlala en sii.cl con una nota de crédito" (`TODO(SII)` en
  `apps/server/src/ventas/servicio.ts`).
- Venta por monto / etiqueta de balanza con precio (ADR-006): la línea cobra un monto exacto
  con un peso estimado, así que `QtyItem × PrcItem` puede diferir en $1 de `MontoItem`. ¿El
  validador del SII lo acepta, o hay que informar "1 × monto" con unidad kg?
- Impuesto a bebidas analcohólicas (art. 42): confirmar que no se desglosa (solo hay oficio para ILA).
- Ley 20.956 art. 13: confirmar texto en leychile.cl y cómo mostrar el redondeo en el ticket.
- e-Boleta: ¿permite emitir sin detalle (solo monto)? ¿Cómo sincroniza lo emitido offline?
- Con software **de mercado**, ¿el contribuyente pasa el set de pruebas o el proveedor lo
  hace por él? (la FAQ 7667 dice que el contribuyente certifica; los proveedores hablan de
  "habilitación" de hasta 15 días).
- Tasa de IVA vigente: 19 % (art. 14 DL 825). Reverificar en Fase 1.
- Al volver de A a D: ¿qué pasa con los folios (CAF) no usados? ¿Hay que anularlos o informarlos?
- Contingencia si el equipo de la caja falla por completo con A: ¿qué permite el SII
  (otro equipo con el mismo CAF, boletas en papel, etc.)?
- Límite numérico del rate limit de la API (no publicado; leerlo de `X-RateLimit-Limit`).
- Envío de boletas (ADR-009): confirmar que `RutReceptor` es siempre `60803000-K` y que
  `RutEnvia` debe ser el RUT autenticado (el ejemplo del OpenAPI usa otro).
- Envío de boletas: confirmar que el archivo `EnvioBOLETA` va en ISO-8859-1 y si el SII
  tolera UTF-8; confirmar `FchResol`/`NroResol` reales para boletas y si `NroResol=0` vale.
- Token del SII: confirmar si dura 1 h desde la emisión o desde el último uso, y la
  semántica de `X-Retry-After` cuando la API responde 405.
- Lote de boletas: confirmar si el máximo recomendado sigue siendo 50 (el schema admite 500)
  y qué hacer con el lote ante un `RPT` (envío repetido).
