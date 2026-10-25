# ADR-001: Estrategia de boleta electrónica (SII)

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25, por el usuario)
- Base: hallazgos de la Fase 0 en `docs/SII_BOLETA_ELECTRONICA.md` §5 (fuentes y fechas allí).

## Contexto

Necesitamos que cada venta del almacén tenga su boleta electrónica válida, sin romper los
principios del producto: **venta en ≤ 3 acciones**, **offline-first**, dueño no técnico,
costo bajo. La Fase 0 encontró cinco hechos que cambian el análisis inicial:

1. **La boleta puede entregarse impresa o virtual** (Res. Ex. 53/2025 derogó la Res. 12/2025).
   Y desde el 1-ene-2026 **imprimir el timbre PDF417 es opcional** (Res. Ex. 207/2025).
2. **Offline es legal**: sin conexión se pueden generar boletas sin enviarlas; hay 1 hora
   para enviarlas **desde que vuelve la conexión** (Res. 74/2020). Pero eso exige tener el
   CAF y la firma **en el equipo del local**. Ningún proveedor en la nube documenta emisión offline.
3. **No hay RVD** desde ago-2022 (Res. 53/2022): un componente menos.
4. **Un solo sistema de boletas por RUT**: o el emisor gratuito del SII, o un software
   propio/de mercado, no ambos a la vez (FAQ SII 001_380_7803). Si un proveedor en la nube
   se cae o se corta internet, **no** se puede emitir "de respaldo" en la app del SII.
5. **Con tarjeta, el voucher ya vale como boleta** si el contribuyente no declaró otro modelo
   de emisión (Res. 76/2021). Por defecto, nuestro POS solo debe emitir boleta en
   efectivo/transferencia → evita duplicados y baja el volumen.

## Opciones consideradas

Supuesto de volumen para los costos: 150 ventas/día, 60 % en efectivo/transferencia →
**~2.700 boletas/mes** (modelo por defecto). Con boleta en todo medio de pago: ~4.500/mes.
UF ≈ $40.000 (aproximado, verificar). Precios consultados el 24–25 oct 2026, sin IVA salvo indicación.

### Tabla comparativa de proveedores (estrategia B) y alternativas

| | **OpenFactura** (Haulmer) | **LibreDTE** | **SimpleAPI** | **Facto** | **Lioren** |
|---|---|---|---|---|---|
| Modelo de cobro | Anual fijo | Mensual + por documento | Anual por nº de consultas | Anual según venta mensual | Cotización |
| Precio publicado | $360.000/año Pyme (inicio $371.790) | $40.000/mes hasta 2.000 docs + $15/doc extra | 5 UF/año (10.000 consultas/mes); 9 UF (50.000); 12 UF (150.000); código fuente 70 UF único | $290.000/año (venta ≤ $25 MM/mes); $490.000 (≤ $75 MM) + cargo por habilitar boleta | No publicado; API se paga aparte |
| Costo estimado ~2.700 boletas/mes | ~$30.000/mes | ~$50.500/mes | ~$17.000/mes (5 UF/año) | ~$24.000–41.000/mes + habilitación | ? |
| Costo estimado ~4.500 boletas/mes | ~$30.000/mes | ~$77.500/mes | ~$17.000–30.000/mes | igual | ? |
| API | REST (`apikey`) | REST | REST + SDK .NET | REST | REST (módulo) |
| Sandbox | Sí (`dev-api.haulmer.com`) | Prueba 10 días + CAF falsos | Gratis 12 meses + ambiente certificación | Sí, credenciales públicas | No documentado |
| Boleta 39/41 y NC 61 | Sí | Sí | Sí | Sí | Sí |
| ¿Quién guarda CAF y certificado? | Proveedor | Proveedor (usuario sube CAF) | **Nosotros** (no almacenan datos) | Proveedor | Proveedor |
| Timbraje offline (CAF local) | No documentado | No (nube); su librería PHP es AGPL | Solo con código fuente on-premise (.NET) | No documentado | No documentado |
| Entrega timbre para imprimir | Sí (`TIMBRE`, `PDF`) | Sí (PDF) | Sí (TED en XML) | No documentado | No documentado |
| ¿Certificación SII? | La gestiona el proveedor ("habilitación") | Igual | **La hacemos nosotros** | La gestiona (con cargo) | Hasta 15 días |

### Estrategias

| | **A. SII directo** (software propio) | **B. Proveedor en la nube** | **C. Solo SII/POS tarjetas** | **D. Puente manual** (e-Boleta SII) |
|---|---|---|---|---|
| Offline | **Sí** (CAF + firma locales, cola < 1 h) | **No**: sin internet no hay boleta | App e-Boleta: sí | App e-Boleta: sí |
| Venta en ≤ 3 acciones | Sí | Sí | No (doble digitación) | No (doble digitación) |
| Costo por boleta | $0 | $0 a $15 según proveedor | $0 | $0 |
| Costo fijo | Certificado ~$12–25 mil/año | $200–600 mil/año + certificado | $0 | $0 |
| Esfuerzo de desarrollo | Alto-medio (XML, TED, firma, API REST, set de pruebas) | Medio-bajo | Nulo | Bajo |
| Trámites del dueño | Certificado + postulación + set (10–15 días hábiles de revisión) | Certificado + alta con proveedor | Ninguno | Ninguno |
| Dependencia de terceros | Solo SII | Proveedor + SII | SII | SII |
| Riesgo principal | Certificación / cambios de la API del SII (anuncian cambio de autenticación) | Corte de internet = venta sin boleta; alza de precios | Mala experiencia en caja | Errores del cajero, cuadratura manual |

Descartadas: **C** como solución final (contradice el objetivo del producto). **RPA del
emisor gratuito** (términos de uso del SII prohíben mecanismos automáticos; ya descartado).
**SimpleAPI código fuente** (es .NET, fuera del stack TypeScript; solo sirve de referencia).

## Decisión

Estrategia **mixta y por etapas: D ahora → A como objetivo → B como plan de contingencia.**

1. **Fases 1–4 (desarrollo y piloto): Estrategia D.** `PuenteManualProvider`: la caja
   registra la venta e imprime el "COMPROBANTE INTERNO – NO VÁLIDO COMO BOLETA"; el cajero
   emite la boleta en la **app e-Boleta del SII** por el total mostrado (gratis, sin
   certificado, funciona con internet intermitente) y la entrega **virtual** (adjunto/foto/QR)
   o impresa. Con tarjeta, el **voucher** es la boleta. Campo opcional "folio SII" para cuadrar.
2. **Fase 5: Estrategia A, `SiiDirectoProvider`.** Es la única que cumple "offline-first"
   de verdad, no cobra por boleta y no depende de terceros. Se simplificó mucho con la
   normativa 2022–2026: sin RVD, timbre impreso opcional, NC por el sitio web del SII.
   Alcance mínimo: CAF local cifrado, TED, firma XMLDSig, `EnvioBOLETA` en lotes de ≤ 50,
   token reutilizado, consulta de estado, cola offline con alerta si una boleta lleva más
   de 45 min pendiente con red. Primero en **certificación** (`apicert`/`pangal`), nunca producción
   en desarrollo. Herramienta para generar el set de pruebas del SII de forma automática.
3. **Contingencia: Estrategia B con OpenFactura** (`ProveedorExternoProvider`), solo si A
   queda bloqueada (por ejemplo, la certificación no se logra en ~6 semanas o el SII cambia la
   autenticación). Elegido por precio fijo ilimitado (no castiga el volumen), sandbox y entrega
   del timbre. LibreDTE queda como segunda opción. Asumir que en B **sin internet no hay boleta**.
4. **Modelo de emisión configurable**, por defecto `SOLO_NO_ELECTRONICOS` (boleta en
   efectivo/transferencia; tarjeta → voucher). `TODO_MEDIO_PAGO` solo si el dueño lo declara en sii.cl.
5. **Reglas que aplican a cualquier provider**: el redondeo de efectivo no entra al DTE
   (la boleta lleva el total exacto); no se desglosan ILA ni el impuesto a bebidas (solo IVA);
   anulación = registro interno + NC (por provider o manual en el sitio del SII) con
   recordatorio en el cierre de caja; conservar XML 6 años.

## Consecuencias

- **Cambio de sistema D → A**: por la regla de sistema único, el día del paso a producción
  el dueño debe **desinscribirse** del sistema gratuito del SII (FAQ 001_380_7816). Hay que
  planificar ese día y no usar e-Boleta después.
- El dueño necesitará certificado digital (~$12–25 mil + IVA/año) y hacer la postulación con
  su clave/certificado; la app debe guiarlo con un paso a paso.
- `packages/printer`: el PDF417 pasa a ser **recomendado, no obligatorio** (se puede imprimir
  la boleta sin él si falla la imagen). Ajustar `docs/ARQUITECTURA.md` §6 en Fase 5.
- Modelo de datos: agregar `modelo_emision` a la configuración del local; en `tax_documents`
  agregar `entrega` (IMPRESA|VIRTUAL) y `folio_externo` (para D). Sin tabla de RVD.
- `docs/CONTEXTO_NEGOCIO.md` (dolor 4) cita la Res. 12/2025 derogada: actualizar a Res. 53/2025.
- Riesgo a vigilar: la spec del SII dice que la autenticación por semilla/token "va a
  cambiar". Encapsular la autenticación para poder reemplazarla.
- Preguntas abiertas que afectan esta decisión: ver `docs/SII_BOLETA_ELECTRONICA.md` §6
  (volumen real del piloto, estabilidad de internet, si ya usa e-Boleta, NC con software propio).
