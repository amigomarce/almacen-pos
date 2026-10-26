# ADR-017: `SII_DIRECTO` exige credenciales de producción en una caja real

- Fecha: 2026-10-26
- Estado: **Aprobado** (2026-10-26)
- Base: CLAUDE.md §2, ADR-001, ADR-011.

## Contexto

CLAUDE.md §2 dice que `SII_DIRECTO` solo se habilita con certificado y CAF cargados **y la
certificación ya hecha**. `siiListo()` revisaba solo datos legales, certificado vigente y
folios, y aceptaba el ambiente `certificacion`. Una caja real podía quedar "emitiendo" boletas
al ambiente de pruebas del SII (sin validez tributaria) sin ningún aviso.

## Opciones consideradas

1. Un indicador manual "certificación hecha" que marca el dueño. Se puede marcar por error.
2. **Usar el ambiente de las credenciales**: al terminar la certificación el SII entrega la
   resolución de producción y las credenciales se cargan con `--ambiente produccion`.
3. Bloquear la emisión al vender. Rompería ventas ya en curso; es mejor impedir la elección.

## Decisión

Opción 2:

- "Certificación hecha" = `store_settings.sii_ambiente = 'produccion'`.
- En una caja real (`NODE_ENV=production`), con datos de certificación `GET /settings` no
  ofrece `SII_DIRECTO` y `PATCH /settings` responde `SII_SIN_CERTIFICAR`.
- En desarrollo se acepta certificación (producción está prohibida ahí, CLAUDE.md §2).
- Si la caja queda en `SII_DIRECTO` con datos de certificación (desarrollo, o credenciales
  recargadas después), `/health` informa `ambienteCertificacion: true` y la caja muestra una
  franja fija: "AMBIENTE DE CERTIFICACIÓN SII – las boletas no tienen validez".

## Consecuencias

- El set de pruebas de la certificación se corre en desarrollo, o con `NODE_ENV` distinto de
  `production`.
- La pregunta del primer arranque y Configuración explican que falta terminar la
  certificación cuando hay datos de certificación cargados.
- `siiListo()` no cambia: sigue diciendo si la caja *sabe* emitir; la regla de producción se
  aplica al *elegir* la modalidad.
