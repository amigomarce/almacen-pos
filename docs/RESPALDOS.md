# Respaldos de la caja

La caja guarda todo en `apps/server/var/almacen.sqlite` (ruta configurable con `ALMACEN_DB`).
Ese archivo contiene ventas, productos, cierres, configuración y los DTE/boletas. Si se pierde
el equipo, se pierde la caja: por eso se respalda solo.

## Qué se respalda

Cada respaldo es una carpeta con:

- `almacen.sqlite`: copia consistente de la base (API de backup de SQLite, respeta WAL).
- `sii.key`: la clave local que descifra el certificado y los CAF del SII, si existe.
- `respaldo.json`: fecha de creación y si incluye la clave.

> Sin `sii.key` no se pueden leer las credenciales tributarias de la base restaurada. El
> respaldo es tan sensible como la caja: guárdalo en un lugar seguro.

## Cuándo y dónde

- Al arrancar el servidor y luego cada 6 horas.
- Solo crea uno si pasaron **20 horas** desde el último (≈ uno por día).
- Se guardan en `apps/server/var/respaldos/` (o `ALMACEN_RESPALDOS`).
- Se conservan los **últimos 14**; los más antiguos se borran automáticamente.
- La carpeta y los archivos quedan con permisos privados (700/600).

## Crear uno a mano

Desde la caja: **Configuración → Respaldos → Respaldar ahora**.

O por consola, desde `apps/server`:

```bash
pnpm respaldo:crear
pnpm respaldo:listar
```

## Restaurar

**Detén la caja primero.** El comando aborta si el servidor local responde en
`127.0.0.1:3001`.

```bash
pnpm respaldo:restaurar --respaldo var/respaldos/almacen-2026-10-25_23-10-00 --si
```

- Antes de pisar la base actual guarda una copia en
  `almacen.sqlite.antes-de-restaurar-<fecha>`.
- Restaura también `sii.key` si venía en el respaldo; si no, mantiene la clave actual.
- Vuelve a arrancar la caja y verifica una venta de prueba.

## Copia fuera del equipo

El respaldo automático vive en el mismo equipo. Además del respaldo cifrado en la nube, **copia
la carpeta `var/respaldos` a un disco externo** de vez en cuando. El respaldo local no sirve si
el equipo se pierde o se daña.

## Respaldo cifrado en la nube

La caja puede subir el último respaldo a **Supabase Storage** (o a otro almacén de objetos con
el mismo adaptador). Se configura desde **Configuración → Nube y respaldo cifrado**:

- **Dirección de la nube**: URL de `apps/cloud`, por ejemplo `https://api.tu-nube.cl`.
- **Copias a conservar**: 1 a 30 (por defecto 7).
- **Respaldar automáticamente en la nube**: activa la subida.

Qué viaja a la nube:

- El respaldo se empaqueta en un `tar.gz` (base + `sii.key` + manifiesto) y se cifra con
  AES-256-GCM.
- La clave (`respaldo.key`) **no se sube**: se guarda en el equipo y el dueño debe descargarla
  desde la misma pantalla. Sin ella no se puede restaurar un respaldo remoto.
- El objeto se guarda en un bucket **privado**; la nube solo entrega metadatos y descarga a la
  caja autenticada.
- Se sube después del respaldo diario y se reintenta cada 15 minutos si falla. El estado
  (subido o error) queda en el manifiesto y se ve en Configuración → Respaldos.

### Configurar Supabase Storage

1. Crea un bucket privado llamado `respaldos` (o define `SUPABASE_STORAGE_BUCKET`).
2. En `apps/cloud`, define `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (solo en el servidor;
   nunca en la caja ni en el móvil).
3. Despliega `apps/cloud` con HTTPS y pon esa URL en Configuración → Nube.
4. Activa el respaldo y descarga la clave de respaldo.

### Restaurar desde la nube

**Detén la caja primero.** Lista los respaldos y restaura por id:

```bash
pnpm respaldo:listar-nube
pnpm respaldo:restaurar-nube --id <id> --si
```

- Descarga, verifica y descifra con `respaldo.key`; si la clave se perdió pero la guardaste,
  pásala con `--clave <base64>`.
- Antes de pisar la base guarda una copia `antes-de-restaurar` local.
- La sincronización con Supabase (productos, ventas, stock, cierres) **no es un respaldo
  completo**: no incluye `tax_documents` ni la clave del SII. El respaldo cifrado sí.

### Plan gratuito

Con 1 GB de Storage y 500 MB de Postgres, el plan free sirve para un piloto de pocos locales;
para producción con varios dueños hay que pasar a Pro o mover los objetos a S3/R2. El adaptador
de almacenamiento permite cambiar sin tocar la lógica.
