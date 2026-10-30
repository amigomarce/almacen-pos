# Nube (apps/cloud)

> **Desde 2026-10-30 la nube va en Render, plan gratis (ADR-023).** Terminó la prueba de Fly.io
> y la máquina no enciende sin tarjeta. Lo de Fly queda abajo como referencia, por si se vuelve
> a un servidor siempre encendido.

## Render (actual)

`render.yaml` (raíz del repo) define el servicio: Docker con `apps/cloud/Dockerfile`, plan
gratis, región Virginia, health check `/health` y despliegue automático al subir cambios de la
nube o de `packages/`.

**Crear el servicio (una vez, lo hace el dueño de las cuentas):**

1. Entra a <https://render.com> con GitHub (el plan gratis no pide tarjeta).
2. **New → Blueprint**, elige el repositorio `almacen-pos` y la rama `main`.
3. Render pide los secretos marcados `sync: false`; cópialos del `.env` de la raíz:
   - `CLOUD_DATABASE_URL`: la del **pooler** de Supabase (`…pooler.supabase.com:5432`, IPv4).
     No la conexión directa `db.<ref>.supabase.co`: es IPv6 y Render no la alcanza.
   - `SUPABASE_URL` y `SUPABASE_JWT_SECRET`.
   - `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SECRET_KEY` = `sb_secret_…`), del panel de
     Supabase → Project Settings → API. Activa el respaldo cifrado.
4. Espera el primer despliegue y anota la dirección (`https://almacen-pos-nube.onrender.com`
   o la que asigne Render). Verifica: `curl https://<dirección>/health`.

**Después de crear el servicio:**

- **Caja instalada:** Configuración → Nube y respaldo cifrado → la dirección nueva → Guardar →
  Probar conexión (si la nube dormía, tarda hasta un minuto). No hace falta reinstalar.
- **Instaladores nuevos:** `gh variable set ALMACEN_CLOUD_URL --body <dirección>`.
- **App del dueño:** `EXPO_PUBLIC_CLOUD_URL` en los entornos `preview` y `production` de EAS
  (`docs/APP_DUENO.md`) y un APK nuevo.

**Estado (2026-10-30):** la cuenta del dueño tiene vinculada solo la caja real de Windows
(`01a18f1e…`, "Caja 1"). Los datos de prueba de la caja de desarrollo del Mac (`01a17677…`: 11
productos, 1 venta, 12 movimientos, 1 cierre, 7 categorías y 2 registros de respaldo) se
borraron de la nube a pedido del dueño. Los 2 archivos de esos respaldos siguen en el bucket
`respaldos` de Supabase Storage (carpeta de esa instalación) y se pueden borrar desde el panel.

**Limitaciones del plan gratis:** se duerme tras 15 min sin tráfico y despierta en ~1 min. La
caja sincroniza cada 10 s, así que con la caja encendida no se duerme. Con la caja apagada, la
app del dueño muestra "Despertando la nube…" y reintenta hasta 90 s. 750 h gratis al mes
alcanzan para tenerla encendida todo el mes.

---

# Referencia: Fly.io (ADR-018, detenida)

La nube es el punto de encuentro entre la caja y la app del dueño: la caja sube ventas, stock y
cierres cada 10 s y baja los cambios del dueño; el celular lee y escribe solo en la nube. Por
eso tiene que estar **en internet, con `https` y siempre encendida** (ADR-018).

- **URL:** <https://almacen-pos-nube.fly.dev> (`/health` responde sin sesión).
- **App de Fly:** `almacen-pos-nube`, organización `personal`, región `gru` (São Paulo), junto a
  la base de Supabase (`sa-east-1`). Fly no tiene región en Santiago.
- **Máquina:** `shared-cpu-1x`, 512 MB, una sola, `auto_stop_machines = "off"` y
  `min_machines_running = 1`: una vez con tarjeta en Fly, no se apaga ni tiene arranque en frío.
  **Ojo:** con la cuenta en modo *trial* (sin tarjeta) Fly detiene la máquina a los 5 minutos;
  ver [Cuenta de Fly](#cuenta-de-fly).
- **Imagen:** `apps/cloud/Dockerfile` (Node 22.23.4, ~67 MB). esbuild compila la nube en un
  solo `main.mjs`; las migraciones viajan aparte y se aplican al arrancar.

Si la caja se queda sin internet, el celular sigue funcionando con lo último que la caja subió;
los cambios de precio y recepciones esperan en la nube hasta que la caja vuelva.

## Secretos

Se cargan con `fly secrets` (nunca en `fly.toml` ni en el repo):

| Secreto | Para qué |
|---|---|
| `CLOUD_DATABASE_URL` | Postgres de Supabase. Hoy usa la conexión **directa IPv6** (`db.<ref>.supabase.co:5432?sslmode=no-verify`); ver [Base de datos](#base-de-datos) |
| `SUPABASE_URL` | Validar el JWT del dueño contra el JWKS del proyecto |
| `SUPABASE_JWT_SECRET` | Validación HS256 de respaldo y firma de la `service_role` legacy |
| `SUPABASE_SERVICE_ROLE_KEY` | **Cargada.** Activa el respaldo cifrado en Storage (ADR-016). Es la `service_role` del proyecto (JWT legacy). Se puede reemplazar por `SUPABASE_SECRET_KEY` (`sb_secret_…`), que tiene prioridad |
| `SUPABASE_STORAGE_BUCKET` | Opcional; por defecto `respaldos` |

```bash
fly secrets list --app almacen-pos-nube
# Rotación futura a la secret key nueva:
fly secrets set --app almacen-pos-nube SUPABASE_SECRET_KEY=sb_secret_...   # reinicia la máquina
```

La secret key nueva **no es un JWT**: se envía solo en el header `apikey` (el adaptador de
Storage ya lo hace). La `service_role` legacy sí es un JWT y viaja también como
`Authorization: Bearer`. Ninguna de las dos va en la caja ni en la app móvil.

El procedimiento completo (bucket privado, secreto, despliegue y verificación de la primera
subida y restauración) está en [`ACTIVAR_RESPALDO_NUBE.md`](ACTIVAR_RESPALDO_NUBE.md).

## Base de datos

La `CLOUD_DATABASE_URL` del `.env` de desarrollo usa el **pooler IPv4** de Supabase
(`aws-1-sa-east-1.pooler.supabase.com:5432`). Desde la máquina de Fly ese pooler **no responde**
(`ETIMEDOUT` en los tres IPs), aunque desde el Mac sí funciona. La conexión directa de Supabase
resuelve a **IPv6** y desde Fly funciona:

```text
postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=no-verify
```

`sslmode=no-verify` mantiene el cifrado pero no valida el certificado (el directo usa una cadena
que Node no confía). Es aceptable para esta máquina única; si se quiere validar, hay que cargar
el CA de Supabase en la imagen. No cambies el `.env` local: el pooler sirve para desarrollo.

Si Fly vuelve a fallar con `ETIMEDOUT`, revisa primero si el pooler está caído y prueba la
conexión directa desde la máquina:

```bash
fly ssh console --app almacen-pos-nube -C \
  "node -e \"const u=new URL(process.env.CLOUD_DATABASE_URL);console.log(u.hostname,u.port)\""
```

## Estado actual (2026-10-26)

- Bucket privado `respaldos` creado; `SUPABASE_SERVICE_ROLE_KEY` cargada y nube redesplegada.
- Caja `01a17677-cede-7337-91fe-4867efd1bdfc` vinculada al dueño
  `arrayan.labs@gmail.com` (`10a5536b-93dc-4994-bf73-af7ae9269012`).
- Dos respaldos cifrados subidos y verificados (7.392 y 7.390 bytes), con SHA-256
  `d778c4f5…2fd126d` y `319ce466…72cab12`; ambos descargados, descifrados y abiertos
  correctamente. El segundo se subió ya con la `service_role` real del proyecto.
- La caja quedó con `cloud_url = https://almacen-pos-nube.fly.dev`, respaldo automático activo
  y retención 7.

## Cuenta de Fly

La app está en la organización `personal` con una máquina en modo **trial**. Fly detiene la
máquina a los **5 minutos** de cada arranque con el aviso:

```text
Trial machine stopping. To run for longer than 5m0s, add a credit card.
```

Mientras no se agregue una tarjeta en <https://fly.io/dashboard>, la nube **no está siempre
encendida**. `auto_start_machines = true` la vuelve a arrancar con la primera petición (unos
segundos de espera), así que el celular puede tener un primer intento lento; la caja, que
sincroniza cada 10 s, la mantiene despierta mientras está encendida. Para el uso real hay que
agregar el método de pago (el costo estimado sigue siendo US$ 3–5/mes).

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
