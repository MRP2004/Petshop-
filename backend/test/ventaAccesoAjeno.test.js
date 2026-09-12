// Prueba de permisos explícita pedida por la revisión: "acceso a compras
// ajenas". obtenerVentaPorId necesita leer la venta real (Venta.findByPk)
// para poder comparar su idCliente contra el de la sesión, así que se
// simula esa lectura (mismo criterio que los otros archivos de esta etapa:
// sin MySQL real, ver ventaDescuentoAutorizacion.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import Venta from '../src/models/venta.model.js';
import { tokenCliente, tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

const originales = {};

// La venta #1 pertenece al cliente 7.
const ventaAjena = {
  idVenta: 1,
  idCliente: 7,
  estado: 'registrada',
  cliente: { idCliente: 7 },
  medioPago: { idMedioPago: 1 },
  detalles: [],
};

before(() => {
  originales.sequelizeTransaction = sequelize.transaction;
  originales.ventaFindByPk = Venta.findByPk;

  Venta.findByPk = async (id) => (Number(id) === ventaAjena.idVenta ? { ...ventaAjena } : null);

  // Transacción falsa (igual que ventaDescuentoAutorizacion.test.js): solo
  // ejecuta el callback con un objeto que expone LOCK.UPDATE. La
  // comprobación de pertenencia de cancelarVenta ocurre DENTRO de esa
  // transacción (lee la venta y compara el dueño antes de tocar nada más),
  // así que hace falta que el callback corra de verdad para poder probarla;
  // si la pertenencia fallara en detectarse, el siguiente paso real sería
  // DetalleVenta.findAll, que no está simulado y fallaría fuerte (no hay
  // forma de que la prueba pase "de casualidad" sin que la comprobación de
  // permisos haya actuado primero).
  sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
});

after(() => {
  sequelize.transaction = originales.sequelizeTransaction;
  Venta.findByPk = originales.ventaFindByPk;
});

test('GET /api/ventas/:id: un cliente distinto del dueño recibe 403, no el detalle ajeno', async () => {
  const respuesta = await request(app)
    .get('/api/ventas/1')
    .set('Authorization', autorizacion(tokenCliente(99))) // cliente 99, la venta es del 7
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para ver esta venta');
});

test('GET /api/ventas/:id: el propio cliente dueño de la venta sí puede verla', async () => {
  const respuesta = await request(app)
    .get('/api/ventas/1')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .expect(200);

  assert.equal(respuesta.body.idVenta, 1);
});

test('GET /api/ventas/:id: personal puede ver la venta de cualquier cliente', async () => {
  const respuesta = await request(app)
    .get('/api/ventas/1')
    .set('Authorization', autorizacion(tokenVendedor()))
    .expect(200);

  assert.equal(respuesta.body.idVenta, 1);
});

test('PATCH /api/ventas/:id/cancelar: un cliente distinto del dueño no puede cancelarla (403, antes de tocar stock o estado)', async () => {
  const respuesta = await request(app)
    .patch('/api/ventas/1/cancelar')
    .set('Authorization', autorizacion(tokenCliente(99)))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para cancelar esta venta');
});

test('GET /api/ventas/999 (inexistente): 404 igual para cualquier rol, no filtra si existe o no es ajena', async () => {
  await request(app)
    .get('/api/ventas/999')
    .set('Authorization', autorizacion(tokenCliente(99)))
    .expect(404);
});
