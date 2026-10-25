# SII — Boleta electrónica

> Estado: **investigación preliminar** (24-oct-2026). Todo lo que diga "verificar" debe
> confirmarse en fuentes oficiales del SII durante la Fase 0 antes de programar.

## 1. Lo que ya sabemos (con fuente)

- **Obligación de entregar boleta impresa** (Res. Ex. SII N°12 de 2025): desde el 1-may-2025
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

_(Completar: pregunta → respuesta → fuente → fecha.)_

## 6. Preguntas abiertas

- ¿El almacén piloto ya está autorizado como emisor de boleta electrónica? ¿Qué usa hoy?
- ¿Tiene certificado digital vigente?
- ¿Qué POS de tarjetas usa (Transbank, Getnet, SumUp, Mercado Pago…) y si este emite boleta?
