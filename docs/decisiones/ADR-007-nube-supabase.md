# ADR-007: Supabase como backend de la nube (Fase 4)

- Fecha: 2026-10-25
- Estado: Aprobado (2026-10-25, por el usuario)

## Contexto

La Fase 4 agrega la nube (`apps/cloud`) que sincroniza la caja con la app móvil del dueño.
Necesitamos, como mínimo:

1. Una base **PostgreSQL** (espejo de los datos que edita el dueño: productos, categorías,
   movimientos de stock, ventas).
2. **Autenticación del dueño** en el móvil (correo).
3. Una vía para que un cambio de precio llegue a la caja "en segundos" (push/pull).

El cliente es un **dueño no técnico, un solo local**. La nube es un espejo: la caja nunca
depende de ella para vender (offline-first, `CLAUDE.md` §3).

## Opciones consideradas

1. **VPS propio con Postgres** (Docker + backups + HTTPS + migraciones manuales).
2. **Supabase** (Postgres administrado + Auth + Realtime + storage).
3. Otro PaaS de Postgres (Neon, RDS, etc.) con Auth propia.

| Criterio | VPS propio | Supabase | Otro PaaS + Auth propia |
|---|---|---|---|
| Operación (backups, parches, HTTPS) | Alta, la asumimos | Baja, la asume Supabase | Media |
| Auth del dueño (correo) | Construirla (JWT, refresh, reseteo de clave) | Lista (Supabase Auth) | Construirla |
| Push de cambios de precio | WebSocket propio | Realtime (opcional) | Construirlo |
| Costo inicial | Fijo bajo | Gratis → pago por uso | Variable |
| Riesgo de lock-in | Ninguno | Algo (Postgres estándar + Auth) | Medio |
| Ajuste al dueño no técnico | Malo | Bueno | Regular |

## Decisión

**Supabase.** Concretamente:

- `apps/cloud` sigue siendo **nuestra** API Fastify (sincronización + endpoints del dueño),
  escrita con Drizzle (`pg-core`) y conectada al Postgres de Supabase por `pg` (`CLOUD_DATABASE_URL`).
- **Auth del dueño**: Supabase Auth (correo + contraseña). `apps/cloud` valida el JWT de
  Supabase en los endpoints del dueño.
- **Auth de la caja**: token por instalación (nuestro, no Supabase), generado en la caja y
  vinculado a la cuenta del dueño escaneando un **QR** desde el móvil.
- **Realtime** queda como mejora posterior; la sincronización arranca con pull/push cada ~10 s
  (baseline de `ARQUITECTURA.md` §2).

## Consecuencias

- Menos operación y menos código de Auth; el dueño puede resetear su clave desde Supabase.
- Dependemos de un SaaS. Mitigación: el modelo usa Postgres estándar y UUIDv7 (sin tipos ni
  funciones propietarias), así que migrar a otro Postgres sería un cambio de URL, no de esquema.
- El JWT de Supabase y el token de la caja son dos mecanismos distintos; hay que no mezclarlos
  (el token de la caja no pasa por Supabase Auth).
- No se usa `pg-mem` ni Postgres real en CI por ahora: los tests de `apps/cloud` validan el
  esquema y la lógica de dominio; la ejecución real contra Postgres se prueba al provisionar
  Supabase en desarrollo (se documenta en `apps/cloud/README` cuando exista).
