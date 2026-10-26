# Activar y verificar el respaldo cifrado en la nube

Guía operativa para dejar funcionando el respaldo cifrado de la caja en **Supabase Storage** a
través de la nube publicada en Fly.io ([`NUBE.md`](NUBE.md), ADR-016). Son pasos manuales: el
bucket y la secret key se crean en el panel de Supabase y el secreto se carga en Fly.

- Proyecto Supabase: `https://wynrzwmtsxyowncecdfl.supabase.co` (`sa-east-1`).
- Nube: `https://almacen-pos-nube.fly.dev` (app `almacen-pos-nube`, región `gru`).
- Bucket: `respaldos` (**privado**).

> La caja nunca recibe la secret key: sube el paquete cifrado a `apps/cloud` con su token de
> dispositivo y es la nube la que escribe en Storage.

> **Estado 2026-10-26:** esta instalación ya quedó activa usando una `service_role` legacy
> (`SUPABASE_SERVICE_ROLE_KEY`) porque aún no se creó la secret key nueva. El procedimiento de
> abajo sirve igual para crearla y rotar; `SUPABASE_SECRET_KEY` tiene prioridad.

## 0. Antes de empezar

```bash
fly auth whoami                       # sesión de Fly activa
curl -s https://almacen-pos-nube.fly.dev/health
```

Debe responder `{"status":"ok","db":"ok",...}`. Si la cuenta de Fly está en trial, la máquina
puede estar detenida (se apaga a los 5 minutos): arráncala con
`fly machine start <id> --app almacen-pos-nube` o agrega una tarjeta. Si no, revisa `fly status`
y `fly logs` antes de seguir.

## 1. Crear el bucket privado

En el panel de Supabase → **Storage** → **New bucket**:

| Campo | Valor |
|---|---|
| Name | `respaldos` |
| Public bucket | **No** (desactivado) |
| File size limit | 50 MB (o el máximo del plan) |
| Allowed MIME types | vacío (la caja sube `application/octet-stream`) |

**Create bucket**.

Alternativa por SQL (SQL Editor del panel), equivalente:

```sql
insert into storage.buckets (id, name, public)
values ('respaldos', 'respaldos', false)
on conflict (id) do nothing;
```

Verifica que exista y sea privado:

```sql
select id, name, public from storage.buckets where id = 'respaldos';
-- public debe ser false
```

No hace falta crear políticas RLS: `apps/cloud` usa la secret key, que omite RLS. La caja y el
móvil no acceden a Storage directamente.

## 2. Crear la secret key

En Supabase → **Project Settings** → **API Keys** → **Secret keys** → **Create new secret key**:

- Nombre: `almacen-nube-storage`.
- Copia el valor `sb_secret_...` (se muestra una sola vez).

> Es la llave más sensible del sistema. No va al repo, ni a la caja, ni al celular, ni a un
> mensaje. Si se filtra, se rota en el panel y se vuelve a cargar en Fly.

## 3. Cargar el secreto en Fly

```bash
fly secrets set --app almacen-pos-nube SUPABASE_SECRET_KEY=sb_secret_...
```

El comando reinicia la máquina. Verifica que quedó cargado (Fly solo muestra el digest, nunca el
valor):

```bash
fly secrets list --app almacen-pos-nube
```

Debe aparecer `SUPABASE_SECRET_KEY`. Opcional, si el bucket tiene otro nombre:

```bash
fly secrets set --app almacen-pos-nube SUPABASE_STORAGE_BUCKET=respaldos
```

> En proyectos antiguos también se acepta `SUPABASE_SERVICE_ROLE_KEY` (una `service_role`
> legacy, que es un JWT). Si ya existe esa variable, no hace falta borrarla: el código prioriza
> `SUPABASE_SECRET_KEY`. Esta instalación quedó así el 2026-10-26.

## 4. Redesplegar la nube

Después de cargar el secreto hay que desplegar para que la máquina lo tome (y para publicar el
commit actual):

```bash
pnpm deploy:cloud
```

Espera a que termine y comprueba:

```bash
curl -s https://almacen-pos-nube.fly.dev/health
fly logs --app almacen-pos-nube
```

En los logs **no** debe aparecer:

```
Sin SUPABASE_SECRET_KEY: el respaldo en la nube queda deshabilitado
```

Si aparece, el secreto no llegó a la máquina: repite el paso 3 y vuelve a desplegar.

## 5. Vincular la caja

La caja debe estar vinculada al dueño; sin vínculo la nube responde `SIN_VINCULAR` y no acepta
respaldos. Si acabas de borrar la instalación de prueba:

1. En la caja: **Configuración → Primera configuración** → muestra el QR.
2. En la app del dueño: inicia sesión y escanea el QR (o usa la carga manual).
3. Verifica en el SQL Editor:

```sql
select id, name, owner_id, linked_at
from installations
order by created_at desc;
```

Debe haber **una** fila con `owner_id` y `linked_at` no nulos.

> Al borrar la fila de `installations`, el token que tenía la caja deja de autenticar (la nube
> solo guarda su SHA-256). Hay que volver a vincular para que la sincronización y el respaldo
> funcionen.

## 6. Configurar el respaldo en la caja

En la caja: **Configuración → Nube y respaldo cifrado**.

1. **Dirección de la nube:** `https://almacen-pos-nube.fly.dev`.
2. **Copias a conservar en la nube:** por ejemplo `7` (rango 1–30).
3. Marca **Respaldar automáticamente en la nube**.
4. **Guardar nube**.
5. **Probar conexión**: debe responder `Nube conectada (versión 0.1.0)`.
6. **Ver clave de respaldo** → **Descargar clave**. Guárdala fuera del equipo (pendrive,
   gestor de contraseñas o papel en caja fuerte). Sin esa clave no se puede restaurar un
   respaldo remoto; la nube no la tiene.

## 7. Forzar la primera subida

En **Configuración → Respaldos** → **Respaldar ahora**.

La caja:

1. crea el respaldo local (base + `sii.key` + manifiesto),
2. lo empaqueta en `tar.gz`,
3. lo cifra con AES-256-GCM (`APOSBK01`),
4. lo sube a `POST /backups` de la nube.

Si falla, reintenta cada 15 minutos y deja el error en el manifiesto. En la misma pantalla,
**Actualizar estado** muestra si ya está en la nube.

## 8. Verificar la subida

### 8.1 En la caja

- **Configuración → Respaldos** debe mostrar `En la nube: <fecha>`.
- En el equipo, el manifiesto del respaldo:

  ```bash
  # macOS: ~/Library/Application Support/cl.almacenpos.caja/respaldos
  # Linux: ~/.local/share/cl.almacenpos.caja/respaldos
  # Windows: %APPDATA%\cl.almacenpos.caja\respaldos
  cat "<carpeta-de-datos>/respaldos/almacen-*/respaldo.json"
  ```

  Debe incluir `"nube": { "subidoEn": "...", "id": "...", "sha256": "..." }`.

- Log de la caja (`server.log`): `Respaldo cifrado subido a la nube`.

### 8.2 En Supabase (metadatos)

SQL Editor:

```sql
select id, owner_id, installation_id, filename, size_bytes, sha256, created_at
from backups
order by created_at desc
limit 10;
```

Debe haber una fila nueva con `size_bytes > 0` y `sha256` de 64 caracteres.

### 8.3 En Supabase Storage (objeto)

**Storage → respaldos** → carpeta `<owner_id>/<installation_id>/` → archivo `<uuid>.apos`.
El tamaño debe coincidir con `size_bytes`.

También puedes verlo por SQL:

```sql
select name, (metadata->>'size')::bigint as size, created_at
from storage.objects
where bucket_id = 'respaldos'
order by created_at desc
limit 10;
```

### 8.4 Integridad

Descarga el `.apos` desde el panel y compáralo con el hash guardado:

```bash
shasum -a 256 <archivo>.apos
```

Debe ser igual al `sha256` de la tabla `backups`. El paquete además está autenticado con GCM: si
se altera un byte, la restauración falla con `RESPALDO_NO_DESCIFRA`.

## 9. Probar una restauración (recomendado)

Hazlo con la caja **detenida** y, idealmente, sobre una copia o un equipo de prueba: reemplaza la
base local.

```bash
# 1. Detén la caja (cierra la app; si corre el servidor, Ctrl+C).
# 2. Lista los respaldos remotos de esta caja:
pnpm --filter @almacen/server respaldo:listar-nube

# 3. Restaura por id (guarda una copia previa automática):
pnpm --filter @almacen/server respaldo:restaurar-nube --id <id> --si
```

Si perdiste `respaldo.key` del equipo pero guardaste la clave:

```bash
pnpm --filter @almacen/server respaldo:restaurar-nube --id <id> --si --clave <base64>
```

Al terminar, abre la caja y verifica productos, ventas y el último cierre.

## 10. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `503 RESPALDOS_NO_CONFIGURADOS` | Falta `SUPABASE_SECRET_KEY` o la nube no se redesplegó | Pasos 3 y 4; revisa `fly logs` |
| `409 SIN_VINCULAR` | La caja no está vinculada al dueño | Paso 5 (QR) |
| `401 NO_AUTENTICADO` | Token de la caja inválido (instalación borrada o reemplazada) | Volver a vincular (paso 5) |
| `RESPALDO_MUY_GRANDE` | Paquete > 45 MB | Revisar tamaño de la base; plan/almacenamiento |
| `ALMACEN_ERROR` 400/403 | Secret key incorrecta, bucket inexistente o no privado | Pasos 1–3 |
| `Nube: <error>` en Configuración | Fallo transitorio de red/Fly | Esperar el reintento de 15 min o **Respaldar ahora** |
| La subida no aparece | Respaldo local no creado o interruptor apagado | Paso 6 y **Respaldar ahora** |

## 11. Checklist final

- [ ] Bucket `respaldos` existe y es **privado**.
- [ ] `SUPABASE_SECRET_KEY` cargada en Fly y nube redesplegada.
- [ ] `/health` responde `db: ok` y los logs no avisan que falta la secret key.
- [ ] Caja vinculada (`installations` con `owner_id` y `linked_at`).
- [ ] URL de Fly guardada en la caja; **Probar conexión** OK.
- [ ] Respaldo automático activado y `respaldo.key` descargada y guardada fuera del equipo.
- [ ] Primera subida verificada en la UI, en `backups` y en Storage.
- [ ] Hash del objeto coincide con `sha256`.
- [ ] Restauración de prueba realizada (o programada) con la caja detenida.
