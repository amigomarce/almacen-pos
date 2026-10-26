# Nube (apps/cloud) en Fly.io

La nube es el punto de encuentro entre la caja y la app del dueño: la caja sube ventas, stock y
cierres cada 10 s y baja los cambios del dueño; el celular lee y escribe solo en la nube. Por
eso tiene que estar **en internet, con `https` y siempre encendida** (ADR-018).

- **URL:** <https://almacen-pos-nube.fly.dev> (`/health` responde sin sesión).
- **App de Fly:** `almacen-pos-nube`, organización `personal`, región `gru` (São Paulo), junto a
  la base de Supabase (`sa-east-1`). Fly no tiene región en Santiago.
- **Máquina:** `shared-cpu-1x`, 512 MB, una sola, `auto_stop_machines = "off"` y
  `min_machines_running = 1`: nunca se apaga ni tiene arranque en frío.
- **Imagen:** `apps/cloud/Dockerfile` (Node 22.23.4, ~67 MB). esbuild compila la nube en un
  solo `main.mjs`; las migraciones viajan aparte y se aplican al arrancar.

Si la caja se queda sin internet, el celular sigue funcionando con lo último que la caja subió;
los cambios de precio y recepciones esperan en la nube hasta que la caja vuelva.

## Secretos

Se cargan con `fly secrets` (nunca en `fly.toml` ni en el repo):

| Secreto | Para qué |
|---|---|
| `CLOUD_DATABASE_URL` | Postgres de Supabase (pooler `sa-east-1`) |
| `SUPABASE_URL` | Validar el JWT del dueño contra el JWKS del proyecto |
| `SUPABASE_JWT_SECRET` | Validación HS256 de respaldo |
| `SUPABASE_SECRET_KEY` | **Falta.** Activa el respaldo cifrado en Storage (ADR-016). Es la secret key nueva (`sb_secret_…`); en proyectos antiguos se acepta `SUPABASE_SERVICE_ROLE_KEY` |

```bash
fly secrets list --app almacen-pos-nube
fly secrets set --app almacen-pos-nube SUPABASE_SECRET_KEY=sb_secret_...   # reinicia la máquina
```

La secret key nueva **no es un JWT**: se envía solo en el header `apikey` (el adaptador de
Storage ya lo hace). Nunca va en la caja ni en la app móvil.

## Desplegar

Desde la raíz del repo, con `fly auth login` hecho:

```bash
pnpm deploy:cloud
```

Construye la imagen en los servidores de Fly (no hace falta Docker en el Mac), aplica las
migraciones al arrancar y reemplaza la máquina. Verificar:

```bash
curl https://almacen-pos-nube.fly.dev/health
fly status --app almacen-pos-nube
fly logs --app almacen-pos-nube
```

## Conectar la caja y el celular

- **Caja:** Configuración → Nube y respaldo cifrado → `https://almacen-pos-nube.fly.dev`
  (se aplica sin reiniciar). Después vincula el celular con el QR.
- **App del dueño:** la URL va en la variable `EXPO_PUBLIC_CLOUD_URL` de EAS de cada perfil
  (`docs/APP_DUENO.md`).
- **Desarrollo local:** `CLOUD_URL` en el `.env` de la raíz apunta a la nube que corresponda.

## Costo

Una máquina `shared-cpu-1x` de 512 MB siempre encendida cuesta del orden de US$ 3–5/mes (más
tráfico, mínimo en este uso). La IPv4 es compartida (gratis); no hace falta una dedicada.
