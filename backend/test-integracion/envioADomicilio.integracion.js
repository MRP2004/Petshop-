// Pruebas de integración real contra MySQL para el domicilio de entrega
// (direccionentrega, ver docs/casos-de-uso.md, "Registrar una venta").
// Requieren una base de pruebas ya preparada (ver
// docs/backend-base-de-datos.md) y NO se ejecutan con `npm test`.
//
// Complementa a test/ventaDescuentoAutorizacion.test.js (persistencia
// simulada) con dos cosas que solo se pueden demostrar contra una base
// real: que la fila efectivamente queda en `direccionentrega`, y que un
// fallo en cualquier parte de la transacción de registrarVenta no deja
// ninguna fila de domicilio huérfana (el domicilio se crea dentro de la
// MISMA transacción que la venta, ver venta.service.js#registrarVenta).
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/database.js';
import DireccionEntrega from '../src/models/direccionEntrega.model.js';
import Venta from '../src/models/venta.model.js';
import { registrarVenta } from '../src/services/venta.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearMedioPagoDePrueba,
  crearProductoDePrueba,
} from './ayudaIntegracion.js';

let cliente;
let medioPago;

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  cliente = await crearClienteDePrueba();
  medioPago = await crearMedioPagoDePrueba();
});

after(async () => {
  await sequelize.close();
});

test('envío a domicilio con dirección válida: la fila queda persistida de verdad, asociada a la venta', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 5 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 1 }],
    metodoEntrega: 'envío a domicilio',
    direccionEntrega: 'Av. Siempre Viva 742, Rosario',
  });

  const filaEnBase = await DireccionEntrega.findByPk(venta.idVenta);
  assert.ok(filaEnBase, 'la fila de direccionentrega debía existir de verdad en la base');
  assert.equal(filaEnBase.direccion, 'Av. Siempre Viva 742, Rosario');
  assert.equal(venta.direccionEntrega.direccion, 'Av. Siempre Viva 742, Rosario');
});

test('retiro en sucursal no crea ninguna fila de domicilio, aunque se mande una dirección', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 5 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 1 }],
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: 'Esto no debería guardarse',
  });

  assert.equal(await DireccionEntrega.findByPk(venta.idVenta), null);
});

test('rollback real: si la venta falla (stock insuficiente de un segundo producto), no queda ninguna fila de domicilio huérfana', async () => {
  const productoConStock = await crearProductoDePrueba({
    nombre: 'Con stock suficiente',
    stockActual: 10,
  });
  const productoSinStock = await crearProductoDePrueba({
    nombre: 'Sin stock suficiente',
    stockActual: 1,
  });

  const [ventasAntes, direccionesAntes] = await Promise.all([
    Venta.count(),
    DireccionEntrega.count(),
  ]);

  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: cliente.idCliente,
        idMedioPago: medioPago.idMedioPago,
        detalles: [
          { idProducto: productoConStock.idProducto, cantidad: 1 },
          { idProducto: productoSinStock.idProducto, cantidad: 5 },
        ],
        metodoEntrega: 'envío a domicilio',
        direccionEntrega: 'Av. Siempre Viva 742, Rosario',
      }),
    (error) => error.statusCode === 409,
  );

  // Ni la venta ni el domicilio pueden haber quedado persistidos a medias:
  // la falta de stock del segundo producto se detecta DENTRO de la misma
  // transacción que crea la venta y (si correspondiera) el domicilio, así
  // que un rechazo ahí revierte todo, incluida cualquier escritura que ya
  // hubiera ocurrido antes en esa misma transacción.
  const [ventasDespues, direccionesDespues] = await Promise.all([
    Venta.count(),
    DireccionEntrega.count(),
  ]);
  assert.equal(ventasDespues, ventasAntes, 'no debía haber quedado ninguna venta nueva');
  assert.equal(
    direccionesDespues,
    direccionesAntes,
    'no debía haber quedado ninguna fila de domicilio huérfana',
  );
});
