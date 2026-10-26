# ADR-016: Respaldo cifrado en la nube y URL de nube configurable

- Fecha: 2026-10-26
- Estado: **Aprobado** (2026-10-26)
- Base: Fase 6, ADR-012 (respaldos locales) y cliente Supabase.

## Contexto

El respaldo local no protege contra robo, incendio o disco dañado. Además, la instalación
empaquetada no tenía forma de apuntar a la nube sin recompilar: `CLOUD_URL` era una variable
de entorno fija. Para el primer cliente (un local, una caja) se necesita:

- respaldo automático cifrado fuera del equipo;
- poder configurar la URL de `apps/cloud` desde la app;
- una base que después permita cambiar Supabase Storage por S3 sin reescribir la lógica.

## Decisión

### Paquete cifrado

- El respaldo local diario (ADR-012) se empaqueta en un `tar.gz` con `almacen.sqlite`,
  `sii.key` y `respaldo.json`.
- Se cifra con **AES-256-GCM** en un formato propio `APOSBK01` (magic + IV + tag + ciphertext).
- La clave de respaldo es un archivo local de 32 bytes (`respaldo.key`, permisos 600). **No se
  sube** y se puede descargar desde Configuración. Sin ella, el respaldo remoto no se puede
  abrir; es el precio de que la nube no tenga la llave.
- Un paquete `.apos` se sube después del respaldo local y se reintenta cada 15 minutos. El
  estado (`subidoEn`/`error`) queda en el manifiesto y se muestra en Configuración → Respaldos.

### Nube y almacenamiento

- `apps/cloud` expone `POST /backups` (token de dispositivo), `GET /backups/caja` y
  `GET /backups/caja/:id` (lista/descarga). Requiere que la caja esté vinculada al dueño;
  si no, responde `SIN_VINCULAR`.
- El paquete viaja por `apps/cloud`, que lo escribe en un `AlmacenObjetos`. La implementación
  actual es **Supabase Storage** (`storage/v1/object/...`), con `service_role` solo en el
  servidor. Mañana un adaptador S3/R2 implementa la misma interfaz.
- Bucket **privado** (`respaldos` por defecto), objeto en
  `ownerId/installationId/<uuid>.apos`. La nube guarda metadatos en la tabla `backups` y poda
  los objetos que sobran según la retención elegida (1–30).
- Límite de 50 MB por objeto (plan free de Supabase); la caja corta en 45 MB y avisa.
- El SHA-256 se calcula en la caja y se verifica en la nube; el paquete está autenticado por
  GCM, así que un archivo alterado no descifra.

### URL de nube configurable

- `store_settings.cloud_url` guarda la URL de `apps/cloud`. La app la edita en
  **Configuración → Nube y respaldo cifrado**.
- El cliente de sincronización recibe una **función** que lee la URL de la configuración en
  cada ciclo; si está vacía usa `CLOUD_URL` (solo desarrollo) y, si tampoco, no sincroniza.
  No hay que reiniciar la caja al cambiarla.
- La misma URL se usa para subir respaldos; `cloud_backup_enabled` y
  `cloud_backup_retention` viven en la configuración local.
- Se valida `http/https`, sin credenciales, query ni hash. En producción se recomienda HTTPS.

### Restauración

- `pnpm respaldo:listar-nube` lista los respaldos del dispositivo.
- `pnpm respaldo:restaurar-nube --id <id> --si` descarga, descifra, extrae y llama a
  `restaurarRespaldo` (copia previa, caja detenida, validación de tablas).
- `--clave <base64>` permite restaurar con una clave guardada fuera del equipo.

## Consecuencias

- Para una caja, el respaldo remoto es automático y no requiere exponer Storage a la caja:
  el token de dispositivo solo habla con `apps/cloud`.
- El servidor de nube necesita `SUPABASE_SECRET_KEY` (o la `SUPABASE_SERVICE_ROLE_KEY` antigua);
  es el secreto más sensible del sistema y no debe viajar al cliente. La secret key nueva
  (`sb_secret_…`) no es un JWT y viaja solo en el header `apikey`.
- El proxy por `apps/cloud` es suficiente para un cliente. Si se escala a miles de cajas,
  conviene emitir URLs firmadas y subir directo a Storage (ADR futuro), sin cambiar el
  contrato de la caja.
- El plan free de Supabase (1 GB Storage, 500 MB Postgres) alcanza para un piloto; para
  producción con varios locales hay que pasar a Pro o mover objetos a S3/R2.
- Si se pierde `respaldo.key` y el equipo, los respaldos remotos no se pueden descifrar. La
  pantalla obliga a descargar la clave; el manual lo recuerda.
- Los respaldos contienen datos tributarios y la clave del SII: el cifrado y el bucket privado
  son obligatorios.

## Verificación

- Cifrado/paquete: roundtrip, clave incorrecta, archivo corrupto, extracción de los tres
  archivos, clave local con permisos 600.
- Subida: URL, hash, retención, token de dispositivo, reintento y estado en el manifiesto;
  no vuelve a subir el mismo respaldo.
- Nube: subida/descarga, hash, límite de tamaño, poda por retención, aislamiento por
  `owner_id`/`installation_id`, bucket inválido y errores de Storage.
- Restauración desde la nube sobre una base destino, verificando la razón social restaurada.
- Configuración: URL válida/ inválida, retención 1–30, no activar sin URL, cambio en caliente
  del cliente de sincronización.
- 1178 tests, typecheck, lint, formato y cobertura limpios.
