import { eq } from 'drizzle-orm';
import { crearApp } from '../app.js';
import { LimitadorIntentos } from '../auth/intentos.js';
import { Sesiones } from '../auth/sesiones.js';
import { abrirDb, type Db } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import * as t from '../db/schema.js';
import { sembrar } from '../db/seed.js';

export interface CtxPrueba {
  db: Db;
  app: ReturnType<typeof crearApp>;
  reloj: { t: number };
  duenoId: string;
  cajeroId: string;
}

/** Base en memoria con los datos de `db:seed` y una app con reloj controlado. */
export function prepararApp(): CtxPrueba {
  const db = abrirDb(':memory:');
  migrar(db);
  sembrar(db);
  const reloj = { t: 1_000_000 };
  const app = crearApp({
    db,
    sesiones: new Sesiones(() => reloj.t),
    intentos: new LimitadorIntentos(() => reloj.t),
  });
  const id = (role: 'DUENO' | 'CAJERO') =>
    db.select().from(t.users).where(eq(t.users.role, role)).get()?.id ?? '';
  return { db, app, reloj, duenoId: id('DUENO'), cajeroId: id('CAJERO') };
}

/** Entra con PIN y devuelve los headers con el token. */
export async function entrarComo(
  c: CtxPrueba,
  usuarioId: string,
  pin: string,
): Promise<{ authorization: string }> {
  const res = await c.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { usuarioId, pin },
  });
  if (res.statusCode !== 200) throw new Error(`login falló: ${res.body}`);
  return { authorization: `Bearer ${res.json<{ token: string }>().token}` };
}
