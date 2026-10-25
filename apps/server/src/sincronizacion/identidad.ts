import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Db } from '../db/client.js';
import { storeSettings } from '../db/schema.js';

export interface Identidad {
  installationId: string;
  deviceToken: string;
}

/**
 * Identidad de la instalación para sincronizar con la nube (Fase 4). Se genera una sola vez y
 * se guarda en `store_settings`; el dueño la vincula a su cuenta escaneando el QR (Etapa 18).
 */
export function obtenerIdentidad(db: Db): Identidad {
  const s = db
    .select({
      installationId: storeSettings.installationId,
      deviceToken: storeSettings.deviceToken,
    })
    .from(storeSettings)
    .get();
  if (s?.installationId && s.deviceToken) {
    return { installationId: s.installationId, deviceToken: s.deviceToken };
  }
  const installationId = uuidv7();
  const deviceToken = randomBytes(32).toString('base64url');
  const existe = db.select({ id: storeSettings.id }).from(storeSettings).get();
  if (existe) {
    db.update(storeSettings)
      .set({ installationId, deviceToken })
      .where(eq(storeSettings.id, 1))
      .run();
  } else {
    db.insert(storeSettings).values({ installationId, deviceToken }).run();
  }
  return { installationId, deviceToken };
}
