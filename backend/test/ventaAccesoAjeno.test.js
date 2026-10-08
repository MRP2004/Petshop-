// Prueba de permisos explícita pedida por la revisión: "acceso a compras
// ajenas". obtenerVentaPorId necesita leer la venta real (Venta.findByPk)
// para poder comparar su idCliente contra el de la sesión, así que se
// simula esa lectura (mismo criterio que los otros archivos de esta etapa:
// sin MySQL real, ver ventaDescuentoAutorizacion.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
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
  originales.ventaFindByPk = Venta.findByPk;
  Venta.findByPk = async (id) => (Number(id) === ventaAjena.idVenta ? { ...ventaAjena } : null);
  // Ya no hace falta simular sequelize.transaction acá (corrección: la
  // cancelación directa ahora se rechaza en el middleware `requiereRol`,
  // antes de que la solicitud llegue a abrir ninguna transacción — ver los
  // dos tests de PATCH /:id/cancelar más abajo).
});

after(() => {
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

// Corrección (revisión de Mauro sobre la venta #20): el cliente ya NO puede
// cancelar directamente, ni siquiera su PROPIA venta — la ruta exige
// vendedor/administrador (ver venta.routes.js), así que esto se rechaza en
// el middleware `requiereRol`, antes de llegar al controller/servicio.
test('PATCH /api/ventas/:id/cancelar: ningún cliente puede cancelar directamente, ni siquiera su propia venta (403 en la ruta, antes del servicio)', async () => {
  const respuesta = await request(app)
    .patch('/api/ventas/1/cancelar')
    .set('Authorization', autorizacion(tokenCliente(7))) // 7 es el dueño real de la venta #1
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('PATCH /api/ventas/:id/cancelar: un cliente distinto del dueño tampoco puede (403)', async () => {
  const respuesta = await request(app)
    .patch('/api/ventas/1/cancelar')
    .set('Authorization', autorizacion(tokenCliente(99)))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('GET /api/ventas/999 (inexistente): 404 igual para cualquier rol, no filtra si existe o no es ajena', async () => {
  await request(app)
    .get('/api/ventas/999')
    .set('Authorization', autorizacion(tokenCliente(99)))
    .expect(404);
});
