# ADR-018: La nube se publica en Fly.io, siempre encendida

- Fecha: 2026-10-26
- Estado: **Aprobado** (2026-10-26)
- Base: ADR-007 (Supabase), Fase 4.

## Contexto

La app del dueño debe conectarse a la caja **desde cualquier lugar y en cualquier momento**.
La caja está detrás del router del local, sin dirección pública, así que el celular no le
habla directo: ambos se encuentran en `apps/cloud`. Hasta ahora la nube solo corría en el Mac
de desarrollo; un APK con `http://192.168.x.x` solo serviría dentro de esa Wi-Fi, e iOS bloquea
`http://` en apps distribuidas.

## Opciones consideradas

1. **Fly.io**, máquina pequeña siempre encendida, `https` automático, región São Paulo.
2. Railway: despliegue desde GitHub muy simple, pero regiones en EE. UU. (más latencia hacia
   Supabase `sa-east-1`).
3. Render gratis: se duerme sin tráfico; la primera consulta tarda ~1 min. Descartado por
   "en cualquier momento".
4. Reescribir la API como Edge Functions de Supabase: evita un servidor más, pero es reescribir
   Fastify/Drizzle sin necesidad.

## Decisión

Fly.io, app `almacen-pos-nube` en `gru`, una máquina `shared-cpu-1x` de 512 MB con
`auto_stop_machines = "off"` y `min_machines_running = 1`, `force_https` y health check en
`/health`. La imagen compila la nube con esbuild en un solo archivo. Los secretos van con
`fly secrets`. Detalle operativo en `docs/NUBE.md`.

## Consecuencias

- Costo del orden de US$ 3–5/mes.
- Una sola máquina: un reinicio o despliegue deja la nube unos segundos fuera; la caja y el
  celular reintentan solos (la caja nunca depende de la nube para vender).
- El despliegue es manual (`pnpm deploy:cloud`); se puede automatizar con GitHub Actions y un
  token de Fly más adelante.
