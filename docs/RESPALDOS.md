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

El respaldo automático vive en el mismo equipo. **Copia la carpeta `var/respaldos` a un disco
externo o a la nube** de vez en cuando (por ejemplo, una vez por semana). El respaldo local no
sirve si el equipo se pierde o se daña.

## Nube

La sincronización con Supabase replica productos, ventas, ítems, movimientos de stock y cierres,
pero **no** es un respaldo completo: no incluye `tax_documents` ni la clave del SII. Para
recuperar la caja completa se usa el respaldo local. El respaldo automático a un bucket de
Supabase queda como mejora futura (requiere credenciales de almacenamiento).
