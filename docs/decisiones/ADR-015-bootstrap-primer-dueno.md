# ADR-015: Bootstrap del primer dueño en una instalación nueva

- Fecha: 2026-10-26
- Estado: **Aprobado** (2026-10-26)
- Base: ADR-013 (asistente) y ADR-014 (instalador).

## Contexto

El instalador crea una base SQLite vacía y migrada. Sin usuarios no se puede entrar a la caja:
la pantalla de PIN no tiene a quién mostrar. El `db:seed` de desarrollo crea dueño/cajero con
PINs conocidos, pero no se puede usar en un local real. Tampoco existe una pantalla para crear
usuarios (la API de usuarios exige sesión de dueño).

## Decisión

- `GET /auth/inicial` (público) devuelve `{ requiereConfiguracion }` según haya o no un dueño
  activo.
- `POST /auth/inicial` (público, **solo si no hay dueño activo**) crea en una transacción:
  - la caja (`registers`) si no existe;
  - el dueño con nombre y PIN (4–8 dígitos, hash);
  - opcionalmente un cajero.
  Devuelve una sesión ya iniciada para no pedir el PIN dos veces.
- Si ya hay un dueño activo responde `409 YA_CONFIGURADO`; no se puede reinstalar ni cambiar
  el dueño por esta vía.
- La POS, al arrancar sin token, consulta `GET /auth/inicial`:
  - si falta configuración muestra **Configura la caja** (nombre del dueño, PIN y repetición,
    nombre de la caja y cajero opcional);
  - si ya está configurada muestra la pantalla de PIN.
- Después de crear el dueño se sigue con el flujo ya existente: pregunta de modalidad
  (ADR-011) y asistente de primera configuración (ADR-013).

## Consecuencias

- Una instalación nueva es usable sin PINs por defecto ni intervención de una terminal.
- El endpoint es público solo en la ventana en que no hay dueño; después queda cerrado.
  Mientras la base esté vacía, cualquiera con acceso físico a la caja puede crear el primer
  dueño: es el mismo nivel de confianza que el instalador.
- Si se pierde la base pero no los datos del local, se vuelve a pedir la instalación; el
  respaldo restaura usuarios y PINs.
- Crear cajeros adicionales después requiere la API de usuarios (aún sin pantalla propia); el
  primer arranque permite dejar uno configurado.

## Verificación

- Servidor: base vacía pide instalación; crea caja, dueño y cajero; la sesión funciona; el
  segundo intento da 409; una base sembrada no pide instalación; PIN/nombre inválidos dan 400.
- POS: la pantalla de instalación valida PIN y confirmación, permite cajero opcional y entra
  directo a abrir la caja.
- La app empaquetada usa esta ruta en el primer arranque (base en el directorio de datos).
