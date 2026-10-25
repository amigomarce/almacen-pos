# Prompt para pegar en Claude Code (primera sesión)

```
Lee CLAUDE.md y todos los archivos de docs/. Vamos a construir el POS para almacén de barrio.

Empieza por la FASE 0: investiga la boleta electrónica del SII siguiendo
docs/SII_BOLETA_ELECTRONICA.md §4. Usa búsqueda web y prioriza fuentes oficiales
(sii.cl). Registra cada hallazgo con su URL y fecha en §5, completa las preguntas
abiertas que puedas y redacta docs/decisiones/ADR-001-estrategia-sii.md con tu
recomendación y una tabla comparativa de proveedores. No escribas código todavía.
Cuando termines, muéstrame un resumen y espera mi aprobación.
```

## Prompts siguientes (uno por fase)

- `Fase 1: propone el plan, espera mi OK y luego implementa según docs/PLAN_FASES.md.`
- `Fase 2: construye el pipeline de la base semilla. Antes, descarga el export de Open Food Facts y dime cuántos productos chilenos válidos hay.`
- `Fase 3: construye la pantalla de venta. Muéstrame primero un mockup y luego impleméntala.`
- …y así sucesivamente.

## Consejos
- No ejecutes `/init`: ya existe CLAUDE.md y lo sobrescribiría.
- Usa modo plan (Shift+Tab) al inicio de cada fase.
- Si Claude Code se desvía, recuérdale: "revisa CLAUDE.md §2 y §3".
