import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../app.js';
import { abrirDb, type Db } from '../db/client.js';
import { migrar } from '../db/migrar.js';
import * as t from '../db/schema.js';
import { sembrar } from '../db/seed.js';
import { LimitadorIntentos, MAX_INTENTOS } from './intentos.js';
import { Sesiones } from './sesiones.js';

interface Ctx {
  db: Db;
  app: ReturnType<typeof crearApp>;
  reloj: { t: number };
  duenoId: string;
  cajeroId: string;
}

function preparar(): Ctx {
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

async function entrar(c: Ctx, usuarioId: string, pin: string): Promise<string> {
  const res = await c.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { usuarioId, pin },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ token: string }>().token;
}

const conToken = (token: string) => ({ authorization: `Bearer ${token}` });

describe('instalación inicial', () => {
  function vacia() {
    const db = abrirDb(':memory:');
    migrar(db);
    return { db, app: crearApp({ db }) };
  }

  it('crea el dueño, la caja y el cajero, y deja la sesión abierta', async () => {
    const { db, app } = vacia();
    const estado = await app.inject({ method: 'GET', url: '/auth/inicial' });
    expect(estado.json()).toEqual({ requiereConfiguracion: true });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/inicial',
      payload: {
        dueno: { nombre: 'Rosa', pin: '1234' },
        caja: { nombre: 'Caja principal' },
        cajero: { nombre: 'Sofía', pin: '0000' },
      },
    });
    expect(res.statusCode).toBe(201);
    const { token, usuario } = res.json<{
      token: string;
      usuario: { name: string; role: string };
    }>();
    expect(usuario).toMatchObject({ name: 'Rosa', role: 'DUENO' });
    expect(
      (await app.inject({ method: 'GET', url: '/auth/sesion', headers: conToken(token) })).json(),
    ).toEqual({ usuario });
    expect(
      db
        .select()
        .from(t.registers)
        .all()
        .map((r) => r.name),
    ).toEqual(['Caja principal']);
    expect(
      db
        .select()
        .from(t.users)
        .all()
        .map((u) => u.role)
        .sort(),
    ).toEqual(['CAJERO', 'DUENO']);
    expect((await app.inject({ method: 'GET', url: '/auth/inicial' })).json()).toEqual({
      requiereConfiguracion: false,
    });
  });

  it('no permite instalar dos veces', async () => {
    const { app } = vacia();
    await app.inject({
      method: 'POST',
      url: '/auth/inicial',
      payload: { dueno: { nombre: 'Rosa', pin: '1234' }, caja: { nombre: 'Caja 1' } },
    });
    const otra = await app.inject({
      method: 'POST',
      url: '/auth/inicial',
      payload: { dueno: { nombre: 'Otro', pin: '9999' }, caja: { nombre: 'Caja 2' } },
    });
    expect(otra.statusCode).toBe(409);
    expect(otra.json()).toMatchObject({ error: 'YA_CONFIGURADO' });
  });

  it('con datos sembrados no pide instalación', async () => {
    const c = preparar();
    expect((await c.app.inject({ method: 'GET', url: '/auth/inicial' })).json()).toEqual({
      requiereConfiguracion: false,
    });
  });

  it('valida el PIN y los nombres', async () => {
    const { app } = vacia();
    const corto = await app.inject({
      method: 'POST',
      url: '/auth/inicial',
      payload: { dueno: { nombre: 'Rosa', pin: '12' }, caja: { nombre: 'Caja 1' } },
    });
    expect(corto.statusCode).toBe(400);
    const sinNombre = await app.inject({
      method: 'POST',
      url: '/auth/inicial',
      payload: { dueno: { nombre: '  ', pin: '1234' }, caja: { nombre: 'Caja 1' } },
    });
    expect(sinNombre.statusCode).toBe(400);
  });
});

describe('auth', () => {
  let c: Ctx;
  beforeEach(() => {
    c = preparar();
  });

  it('lista los usuarios activos sin datos sensibles', async () => {
    const res = await c.app.inject({ method: 'GET', url: '/auth/usuarios' });
    expect(res.statusCode).toBe(200);
    const lista = res.json<Record<string, unknown>[]>();
    expect(lista.map((u) => u['name']).sort()).toEqual(['Cajero', 'Dueño']);
    for (const u of lista) expect(Object.keys(u).sort()).toEqual(['id', 'name', 'role']);
  });

  it('entra con el PIN correcto y consulta su sesión', async () => {
    const res = await c.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { usuarioId: c.cajeroId, pin: '0000' },
    });
    expect(res.statusCode).toBe(200);
    const { token, usuario } = res.json<{ token: string; usuario: unknown }>();
    expect(usuario).toEqual({ id: c.cajeroId, name: 'Cajero', role: 'CAJERO' });

    const yo = await c.app.inject({ method: 'GET', url: '/auth/sesion', headers: conToken(token) });
    expect(yo.json()).toEqual({ usuario });
  });

  it('rechaza PIN incorrecto e informa los intentos que quedan', async () => {
    const res = await c.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { usuarioId: c.cajeroId, pin: '9999' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: 'PIN_INCORRECTO',
      mensaje: 'PIN incorrecto',
      intentosRestantes: MAX_INTENTOS - 1,
    });
  });

  it('bloquea al usuario tras 5 PIN malos, aun con el PIN correcto', async () => {
    const intento = (pin: string) =>
      c.app.inject({ method: 'POST', url: '/auth/login', payload: { usuarioId: c.cajeroId, pin } });
    for (let i = 0; i < MAX_INTENTOS - 1; i++) expect((await intento('1111')).statusCode).toBe(401);
    const quinto = await intento('1111');
    expect(quinto.statusCode).toBe(429);
    expect(quinto.json()).toMatchObject({ error: 'BLOQUEADO', segundos: 60 });
    expect((await intento('0000')).statusCode).toBe(429);
    // Otro usuario no queda bloqueado.
    await entrar(c, c.duenoId, '1234');
    c.reloj.t += 60_000;
    expect((await intento('0000')).statusCode).toBe(200);
  });

  it('no deja entrar a un usuario inexistente o desactivado', async () => {
    const r1 = await c.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { usuarioId: 'no-existe', pin: '0000' },
    });
    expect(r1.statusCode).toBe(401);
    c.db.update(t.users).set({ active: false }).where(eq(t.users.id, c.cajeroId)).run();
    const r2 = await c.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { usuarioId: c.cajeroId, pin: '0000' },
    });
    expect(r2.statusCode).toBe(401);
  });

  it.each([{}, { usuarioId: 'x' }, { usuarioId: 'x', pin: '12' }, { usuarioId: 'x', pin: 'abcd' }])(
    'valida el cuerpo del login %j',
    async (payload) => {
      const res = await c.app.inject({ method: 'POST', url: '/auth/login', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'DATOS_INVALIDOS', mensaje: 'Datos inválidos' });
    },
  );

  it('exige sesión válida y la cierra con logout', async () => {
    expect((await c.app.inject({ method: 'GET', url: '/auth/sesion' })).json()).toEqual({
      error: 'SIN_SESION',
      mensaje: 'Ingresa tu PIN para continuar',
    });
    const malo = await c.app.inject({
      method: 'GET',
      url: '/auth/sesion',
      headers: { authorization: 'Basic abc' },
    });
    expect(malo.statusCode).toBe(401);
    const vacio = await c.app.inject({
      method: 'GET',
      url: '/auth/sesion',
      headers: { authorization: 'Bearer  ' },
    });
    expect(vacio.statusCode).toBe(401);

    const token = await entrar(c, c.cajeroId, '0000');
    const out = await c.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: conToken(token),
    });
    expect(out.statusCode).toBe(204);
    const despues = await c.app.inject({
      method: 'GET',
      url: '/auth/sesion',
      headers: conToken(token),
    });
    expect(despues.statusCode).toBe(401);
  });

  it('la sesión vence tras 12 horas sin uso', async () => {
    const token = await entrar(c, c.cajeroId, '0000');
    c.reloj.t += 12 * 60 * 60 * 1000 + 1;
    const res = await c.app.inject({
      method: 'GET',
      url: '/auth/sesion',
      headers: conToken(token),
    });
    expect(res.statusCode).toBe(401);
  });

  describe('POST /auth/autorizar (clave del dueño)', () => {
    it('confirma la clave del dueño sin abrir sesión', async () => {
      const token = await entrar(c, c.cajeroId, '0000');
      const res = await c.app.inject({
        method: 'POST',
        url: '/auth/autorizar',
        headers: conToken(token),
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ autorizadoPor: { id: c.duenoId, name: 'Dueño' } });
    });

    it('el PIN de un cajero no sirve como clave del dueño, y se bloquea tras 5 fallos', async () => {
      const token = await entrar(c, c.cajeroId, '0000');
      const autorizar = (pin: string) =>
        c.app.inject({
          method: 'POST',
          url: '/auth/autorizar',
          headers: conToken(token),
          payload: { pin },
        });
      const r = await autorizar('0000');
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ mensaje: 'Clave del dueño incorrecta' });
      for (let i = 0; i < MAX_INTENTOS - 2; i++) await autorizar('0000');
      expect((await autorizar('0000')).statusCode).toBe(429);
      expect((await autorizar('1234')).statusCode).toBe(429);
    });

    it('requiere sesión', async () => {
      const res = await c.app.inject({
        method: 'POST',
        url: '/auth/autorizar',
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('gestión de usuarios', () => {
    it('el cajero no puede ver ni crear usuarios', async () => {
      const token = await entrar(c, c.cajeroId, '0000');
      const res = await c.app.inject({ method: 'GET', url: '/users', headers: conToken(token) });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'SIN_PERMISO' });
    });

    it('el dueño crea un cajero que luego puede entrar', async () => {
      const token = await entrar(c, c.duenoId, '1234');
      const res = await c.app.inject({
        method: 'POST',
        url: '/users',
        headers: conToken(token),
        payload: { name: '  Sofía ', role: 'CAJERO', pin: '4321' },
      });
      expect(res.statusCode).toBe(201);
      const nueva = res.json<{ id: string }>();
      expect(nueva).toMatchObject({ name: 'Sofía', role: 'CAJERO', active: true });
      expect(nueva).not.toHaveProperty('pinHash');
      await entrar(c, nueva.id, '4321');

      const lista = await c.app.inject({ method: 'GET', url: '/users', headers: conToken(token) });
      expect(lista.json<unknown[]>()).toHaveLength(3);
    });

    it.each([
      { name: '', role: 'CAJERO', pin: '1111' },
      { name: '   ', role: 'CAJERO', pin: '1111' },
      { name: 'X', role: 'ADMIN', pin: '1111' },
      { name: 'X', role: 'CAJERO', pin: '1' },
    ])('valida los datos del usuario nuevo %j', async (payload) => {
      const token = await entrar(c, c.duenoId, '1234');
      const res = await c.app.inject({
        method: 'POST',
        url: '/users',
        headers: conToken(token),
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it('cambiar el PIN o desactivar cierra las sesiones de ese usuario', async () => {
      const tDueno = await entrar(c, c.duenoId, '1234');
      const tCajero = await entrar(c, c.cajeroId, '0000');
      const editar = (payload: object) =>
        c.app.inject({
          method: 'PATCH',
          url: `/users/${c.cajeroId}`,
          headers: conToken(tDueno),
          payload,
        });

      const r = await editar({ name: 'Cajera' });
      expect(r.json()).toMatchObject({ name: 'Cajera', active: true });
      // Cambiar solo el nombre no lo saca.
      expect(
        (await c.app.inject({ method: 'GET', url: '/auth/sesion', headers: conToken(tCajero) }))
          .statusCode,
      ).toBe(200);

      await editar({ pin: '5555' });
      expect(
        (await c.app.inject({ method: 'GET', url: '/auth/sesion', headers: conToken(tCajero) }))
          .statusCode,
      ).toBe(401);
      const tNuevo = await entrar(c, c.cajeroId, '5555');

      expect((await editar({ active: false })).json()).toMatchObject({ active: false });
      expect(
        (await c.app.inject({ method: 'GET', url: '/auth/sesion', headers: conToken(tNuevo) }))
          .statusCode,
      ).toBe(401);
      const fila = c.db.select().from(t.users).where(eq(t.users.id, c.cajeroId)).get();
      expect(fila?.version).toBe(4);
    });

    it('no deja al local sin un dueño activo', async () => {
      const token = await entrar(c, c.duenoId, '1234');
      const editar = (id: string, payload: object) =>
        c.app.inject({ method: 'PATCH', url: `/users/${id}`, headers: conToken(token), payload });

      for (const payload of [{ active: false }, { role: 'CAJERO' }]) {
        const r = await editar(c.duenoId, payload);
        expect(r.statusCode).toBe(409);
        expect(r.json()).toMatchObject({ error: 'ULTIMO_DUENO' });
      }
      // Con un segundo dueño, sí se puede.
      await editar(c.cajeroId, { role: 'DUENO' });
      expect((await editar(c.duenoId, { role: 'CAJERO' })).statusCode).toBe(200);
    });

    it('responde 404 y 400 en ediciones inválidas', async () => {
      const token = await entrar(c, c.duenoId, '1234');
      const r404 = await c.app.inject({
        method: 'PATCH',
        url: '/users/no-existe',
        headers: conToken(token),
        payload: { name: 'X' },
      });
      expect(r404.statusCode).toBe(404);
      const r400 = await c.app.inject({
        method: 'PATCH',
        url: `/users/${c.cajeroId}`,
        headers: conToken(token),
        payload: {},
      });
      expect(r400.statusCode).toBe(400);
    });
  });
});
