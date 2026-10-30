# ADR-023: La nube pasa de Fly.io a Render (plan gratis)

- Fecha: 2026-10-30
- Estado: **Aprobado** (2026-10-30)
- Reemplaza: ADR-018 (Fly.io) mientras no se pague un servidor siempre encendido.

## Contexto

Terminó la prueba gratis de Fly.io: la máquina `almacen-pos-nube` quedó detenida ("trial has
ended") y no vuelve a encender sin tarjeta. Sin nube, la caja no sincroniza (Configuración →
Nube decía "La nube respondió 0") y el celular no puede vincular la caja. El dueño prefirió una
opción sin tarjeta.

## Opciones consideradas

1. **Render, plan gratis**: Docker desde el repositorio, sin tarjeta para el plan gratis,
   750 h/mes. Se duerme tras 15 min sin tráfico y tarda ~1 min en despertar. Sin región en
   Sudamérica.
2. Koyeb gratis: se duerme tras 1 h; en 2026 la exigencia de tarjeta es contradictoria.
3. Google Cloud Run: región Santiago y nivel gratis, pero exige cuenta de facturación (tarjeta).
4. Vercel: gratis y con región São Paulo, pero obliga a adaptar la API a funciones.
5. Fly.io con tarjeta (US$ 3–5/mes): sigue siendo la mejor para uso real.

## Decisión

Render gratis, con `render.yaml` en la raíz (Blueprint): servicio web Docker con
`apps/cloud/Dockerfile`, región Virginia, health check `/health` y despliegue automático solo
cuando cambia la nube o los paquetes compartidos. Los secretos se escriben en el panel de Render.

- **Base de datos:** el pooler IPv4 de Supabase (Render no sale por IPv6; en Fly se usaba la
  conexión directa IPv6).
- **Despertar:** la caja sincroniza cada 10 s, así que con la caja encendida la nube no se
  duerme. La app del dueño reintenta hasta 90 s (GET sin respuesta; cualquier método con
  502/503/504 del proxy) y muestra "Despertando la nube…". La prueba de conexión de la caja
  espera hasta 75 s.
- **Dirección:** la caja usa primero la de Configuración → Nube, así que una caja instalada se
  cambia sin reinstalar. El APK la recibe al compilar (`EXPO_PUBLIC_CLOUD_URL` en EAS).

## Consecuencias

- Con la caja apagada, la primera consulta del celular tarda cerca de un minuto.
- Render puede reiniciar el servicio en cualquier momento (la nube no guarda estado propio).
- Volver a Fly (u otro servidor siempre encendido) solo requiere cambiar la dirección: la
  imagen Docker es la misma.
