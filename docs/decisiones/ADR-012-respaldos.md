# ADR-012: Respaldos locales automáticos y restauración

- Fecha: 2026-10-25
- Estado: **Aprobado** (2026-10-25)
- Base: Fase 6 (`docs/PLAN_FASES.md`), ARQUITECTURA §2 y ADR-005.

## Contexto

La caja es la fuente de verdad del local: ventas, productos, cierres, configuración y DTE
viven en `almacen.sqlite`. La sincronización con la nube no es un respaldo completo (no
incluye `tax_documents` ni la clave que descifra las credenciales del SII). Un disco dañado,
un robo o un error humano dejarían al almacén sin historial tributario.

## Decisión

### Respaldo local automático

- `apps/server/src/respaldos/servicio.ts` usa `db.$client.backup()` de better-sqlite3, que
  invoca la API de backup de SQLite y produce una copia consistente incluso con WAL.
- Al arrancar el servidor se hace una pasada; luego cada 6 horas. Solo se crea un respaldo si
  pasaron **20 horas** desde el último (≈ uno por día).
- Cada respaldo es una carpeta `almacen-AAAA-MM-DD_HH-mm-ss` con:
  - `almacen.sqlite`;
  - `sii.key`, si existe (sin ella no se descifran las credenciales SII de la base);
  - `respaldo.json` (fecha e inclusión de la clave).
- Carpetas 700 y archivos 600. Se conservan los últimos **14**.
- Un fallo a mitad de la copia borra la carpeta incompleta: nunca queda un respaldo que
  parezca válido y no lo sea.

### Restauración

- Solo por consola, con la caja detenida:
  `pnpm respaldo:restaurar --respaldo <carpeta> --si`.
- Valida que el archivo sea una base de Almacén POS (tablas `store_settings`, `products`,
  `sales`).
- Antes de reemplazar la base guarda una copia `almacen.sqlite.antes-de-restaurar-<fecha>`
  (usa la API de backup; si la base actual está corrupta, copia el archivo tal cual).
- Restaura `sii.key` si venía; si no, conserva la actual.
- El comando aborta si `127.0.0.1:3001/health` responde, para no pisar una base en uso.

### Interfaz

- `GET /backups` y `POST /backups` (solo dueño): listar y crear a mano. No se expone la ruta
  absoluta ni la restauración por HTTP.
- **Configuración → Respaldos** muestra el último respaldo, su tamaño y un botón
  "Respaldar ahora".

### Nube

La sincronización existente sigue siendo la copia operativa para la app móvil. El respaldo a
un bucket de Supabase queda como mejora futura: requiere credenciales de almacenamiento y no
bloquea la Fase 6.

## Consecuencias

- La caja se respalda sin intervención del dueño y el respaldo incluye todo lo necesario para
  volver a operar, incluida la clave del SII.
- El respaldo vive en el mismo equipo; el dueño debe copiar `var/respaldos` a un disco externo
  o a la nube. La app lo recuerda en Configuración.
- Restaurar exige detener la caja y confirmar con `--si`.
- Los respaldos contienen datos tributarios y una clave: se tratan como secretos.
- El ciclo automático no reemplaza un plan de copia externa; el manual de la Fase 6 lo explica.

## Verificación

- Tests del servicio: copia de base y clave, manifiesto, permisos, colisión de nombres, poda,
  intervalo de 20 horas, respaldo fallido sin carpeta a medias, restauración con copia previa,
  restauración sin base previa y rechazo de archivos inválidos.
- Tests de rutas: dueño lista/crea, cajero recibe 403 y sin sesión 401.
- Test de la POS: muestra el último respaldo y crea uno nuevo.
- Prueba manual del CLI: `respaldo:crear`, `respaldo:listar` y el aborto de `restaurar` con el
  servidor activo.
