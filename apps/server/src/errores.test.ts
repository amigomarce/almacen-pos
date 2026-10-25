import { ErrorDominio } from '@almacen/core';
import { describe, expect, it } from 'vitest';
import { crearApp } from './app.js';
import { abrirDb } from './db/client.js';

describe('manejo de errores', () => {
  const app = crearApp({ db: abrirDb(':memory:') });
  app.get('/prueba/dominio', () => {
    throw new ErrorDominio('PAGO_INSUFICIENTE', 'El monto pagado es menor al total');
  });
  app.get('/prueba/interno', () => {
    throw new Error('detalle técnico que no debe verse');
  });
  app.get('/prueba/http', () => {
    throw Object.assign(new Error('Muy grande'), { statusCode: 413, code: 'DEMASIADO_GRANDE' });
  });

  it('un error del dominio responde 400 con su código y mensaje', async () => {
    const res = await app.inject({ method: 'GET', url: '/prueba/dominio' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'PAGO_INSUFICIENTE',
      mensaje: 'El monto pagado es menor al total',
    });
  });

  it('un error inesperado responde 500 sin detalles internos', async () => {
    const res = await app.inject({ method: 'GET', url: '/prueba/interno' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' });
  });

  it('un error HTTP conserva su estado', async () => {
    const res = await app.inject({ method: 'GET', url: '/prueba/http' });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: 'DEMASIADO_GRANDE', mensaje: 'Muy grande' });
  });
});
