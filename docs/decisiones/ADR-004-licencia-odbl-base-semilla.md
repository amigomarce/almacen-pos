# ADR-004: Licencia ODbL de la base semilla de productos

- Fecha: 2026-10-25
- Estado: Propuesto

## Contexto

La base semilla (`seed.sqlite`) se construye con datos de Open Food Facts (OFF) y sus
proyectos hermanos (Open Pet Food Facts, Open Beauty Facts, Open Products Facts). Todos usan:

- **Base de datos**: Open Database License (ODbL 1.0).
- **Contenido de cada ficha** (nombre, marca, cantidad…): Database Contents License (DbCL).
- **Imágenes**: CC BY-SA (3.0 según el enlace de los términos de uso de OFF).

Además, OFF pide citar la autoría con un enlace a `https://openfoodfacts.org` y avisa que las
marcas, el diseño de los envases y las fotos pueden tener derechos de terceros.

Nuestro caso de uso:

1. Normalizamos, deduplicamos y re-categorizamos el subconjunto chileno, y lo **distribuimos
   dentro del instalador** de la caja a cada local.
2. La caja y la app móvil **muestran** esos datos (pantalla de venta, boleta, listados).
3. Cada local **crea productos propios** (los que no están en la semilla) y les pone precio y stock.
4. A futuro, un local podría aportar (opt-in) sus productos a la base central.
5. Lista curada propia (`data/curado/`) y plantillas sin código hechas por nosotros.

## Qué exige la ODbL en cada punto

| Caso | Figura ODbL | Obligación |
|---|---|---|
| `seed.sqlite` en el instalador | **Base derivada** (adaptamos y extraemos una parte sustancial) que se usa **públicamente** (la reciben personas fuera de nuestro control) | §4.2: distribuirla bajo ODbL, con la licencia o su URI **dentro de la base y en su documentación**. §4.4: share-alike (no se puede re-licenciar con otra licencia). §4.6: ofrecer gratis por internet la base derivada completa **o** el método para reconstruirla (nuestro ETL en `data/` cumple esta segunda opción). §4.7: no cifrarla ni bloquearla con DRM; se puede poner detrás de login. |
| Pantallas, boletas, reportes que muestran datos | **Obra producida** | §4.3: aviso visible de que los datos vienen de OFF y están bajo ODbL, con enlace a la base y a la licencia → pantalla **"Acerca de"**. La obra producida en sí (la UI, la boleta) **no** queda bajo ODbL. No hace falta imprimir el aviso en cada boleta. |
| Base local de cada almacén (semilla + productos propios + precios) | Base derivada de **uso interno** | §4.5: el uso interno no es público → **sin obligación** de compartir los productos ni los precios que crea cada local. |
| Aporte opt-in a la base central (futuro) | Se mezcla con la base derivada que distribuimos | Lo aportado pasa a ser ODbL al redistribuirlo. El texto del opt-in debe decirlo. Nunca incluye precios ni stock. Ideal: devolverlo también a OFF. |
| Lista curada propia | Si se fusiona con OFF en `seed_products` → parte de la base derivada → ODbL | Decisión: mantenerla bajo ODbL igual (simple, sin mezclar licencias). |
| Imágenes | CC BY-SA, licencia aparte | Solo guardamos `image_url` en la semilla; **no empaquetamos imágenes**. Hoy la caja no persiste ni muestra esa URL (mejora en `PLAN_FASES.md`). Si en el futuro se cachean, requieren atribución CC BY-SA propia. |
| Nombre y logo de OFF | No cubiertos por la ODbL | Citarlos como fuente; no usar el logo ni sugerir respaldo de OFF. |

## Decisión

1. `seed.sqlite` se publica bajo **ODbL 1.0**. Lleva una tabla `seed_meta` con: licencia, URI
   de la licencia, fuentes con su URL, fecha de cada export y texto de atribución.
2. Junto al archivo va `ATRIBUCION.md` (licencia, fuentes, cómo reconstruir con
   `pnpm data:build`). El código del ETL queda disponible para cumplir §4.6(b). Si el repo no se
   publica, ofreceremos la `seed.sqlite` descargable de forma gratuita (§4.6(a)).
3. Pantalla **"Acerca de"** en la caja y en la app móvil con este texto (el servidor lo expone
   desde `seed_meta`):
   > Datos de productos de Open Food Facts (https://openfoodfacts.org) y proyectos asociados,
   > disponibles bajo la Open Database License (https://opendatacommons.org/licenses/odbl/1-0/).
   > Contenido de cada ficha bajo la Database Contents License.
4. Los productos y precios de cada local son privados y no se distribuyen. El aporte a la base
   central (si se hace) será opt-in y con aviso de que entra bajo ODbL.
5. No se empaquetan imágenes de OFF.

## Consecuencias

- Cualquiera puede reutilizar nuestra `seed.sqlite` bajo ODbL; es el precio de partir con miles
  de productos sin inventariar a mano. Nuestra ventaja está en la app, no en la base.
- No podemos cifrar la semilla para "protegerla"; si algún día la cifráramos, habría que ofrecer
  también una copia sin restricción (§4.7(b)).
- Si mezcláramos otra fuente con licencia incompatible (por ejemplo un catálogo comercial),
  no podría ir en la misma base: tendría que ser una base separada (colectiva, §4.5).
- Dudas abiertas, sin asesoría legal (no bloquean el ETL):
  - ¿Basta con el ETL público para §4.6, o conviene publicar además la `seed.sqlite` compilada?
    Propuesta: publicar ambas.
  - Ley chilena 17.336 (propiedad intelectual): no tiene un derecho sui generis de bases de
    datos como el europeo. La ODbL sigue funcionando como contrato. Para un uso comercial a gran
    escala conviene que lo confirme un abogado.
