import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import {
  crearProducto,
  actualizarProducto,
  ajustarStockProducto,
} from '../src/services/producto.service.js';
import { MAXIMO_ENTERO_POSITIVO } from '../src/utils/validacion.js';
import { tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que en ventaEntradasInvalidas.test.js: todos
// estos casos deben fallar en validación antes de que el servicio llegue a
// tocar la base (crearProducto/actualizarProducto/ajustarStockProducto
// validan el cuerpo antes de cualquier findByPk/create/transaction). Se
// interceptan los tres puntos de entrada reales de Sequelize hacia MySQL
// para que cualquier intento real falle de inmediato, y se restauran al
// terminar.
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;

let intentosDeTransaccion = 0;
let intentosDeQuery = 0;
let intentosDeConexion = 0;

before(() => {
  sequelize.transaction = () => {
    intentosDeTransaccion += 1;
    throw new Error(
      'Protección de prueba: no se esperaba abrir una transacción real contra MySQL',
    );
  };

  sequelize.query = () => {
    intentosDeQuery += 1;
    throw new Error(
      'Protección de prueba: no se esperaba ejecutar una consulta real contra MySQL',
    );
  };

  sequelize.connectionManager.getConnection = () => {
    intentosDeConexion += 1;
    throw new Error(
      'Protección de prueba: no se esperaba adquirir una conexión real contra MySQL',
    );
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;

  assert.equal(intentosDeTransaccion, 0, 'no debía abrirse una transacción real');
  assert.equal(intentosDeQuery, 0, 'no debía ejecutarse una consulta real');
  assert.equal(intentosDeConexion, 0, 'no debía adquirirse una conexión real');
});

// --- crearProducto / actualizarProducto: forma del cuerpo e importes ---

test('crearProducto rechaza un cuerpo null', async () => {
  await assert.rejects(
    () => crearProducto(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del producto no es válido',
  );
});

test('crearProducto rechaza un cuerpo que es un arreglo', async () => {
  await assert.rejects(
    () => crearProducto([1, 2]),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del producto no es válido',
  );
});

test('crearProducto rechaza un precio booleano en vez de aceptarlo como 1 o 0', async () => {
  await assert.rejects(
    () =>
      crearProducto({
        nombre: 'Alimento perro',
        precio: true,
        stockActual: 10,
        stockMinimo: 1,
      }),
    (error) => error.statusCode === 400 && error.message === 'El precio no es válido',
  );
});

test('crearProducto rechaza un stockActual booleano', async () => {
  await assert.rejects(
    () =>
      crearProducto({
        nombre: 'Alimento perro',
        precio: 10,
        stockActual: true,
        stockMinimo: 1,
      }),
    (error) => error.statusCode === 400,
  );
});

test('crearProducto rechaza un idProveedor con notación hexadecimal', async () => {
  await assert.rejects(
    () =>
      crearProducto({
        nombre: 'Alimento perro',
        precio: 10,
        stockActual: 10,
        stockMinimo: 1,
        idProveedor: '0x10',
      }),
    (error) => error.statusCode === 400 && error.message === 'El ID del proveedor no es válido',
  );
});

test('actualizarProducto rechaza el cuerpo si intenta modificar stockActual', async () => {
  await assert.rejects(
    () =>
      actualizarProducto(1, {
        nombre: 'Alimento perro',
        precio: 10,
        stockMinimo: 1,
        stockActual: 999,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message ===
        'El stock no se modifica por esta vía: use PATCH /api/productos/:id/stock',
  );
});

test('actualizarProducto rechaza un cuerpo null antes de buscar el producto', async () => {
  await assert.rejects(
    () => actualizarProducto(1, null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del producto no es válido',
  );
});

// --- ajustarStockProducto (PATCH /:id/stock) ---

test('ajustarStockProducto rechaza un cuerpo null', async () => {
  await assert.rejects(
    () => ajustarStockProducto(1, null),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del movimiento de stock no es válido',
  );
});

test('ajustarStockProducto rechaza cantidad ausente', async () => {
  await assert.rejects(
    () => ajustarStockProducto(1, {}),
    (error) => error.statusCode === 400,
  );
});

test('ajustarStockProducto rechaza cantidad cero', async () => {
  await assert.rejects(
    () => ajustarStockProducto(1, { cantidad: 0 }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La cantidad del movimiento no puede ser cero',
  );
});

test('ajustarStockProducto rechaza cantidad no entera', async () => {
  await assert.rejects(
    () => ajustarStockProducto(1, { cantidad: 1.5 }),
    (error) => error.statusCode === 400,
  );
});

test('ajustarStockProducto rechaza cantidad booleana', async () => {
  await assert.rejects(
    () => ajustarStockProducto(1, { cantidad: true }),
    (error) => error.statusCode === 400,
  );
});

test('ajustarStockProducto rechaza cantidad fuera del rango de INTEGER', async () => {
  await assert.rejects(
    () => ajustarStockProducto(1, { cantidad: MAXIMO_ENTERO_POSITIVO + 1 }),
    (error) => error.statusCode === 400,
  );
});

// --- Mismos casos representativos por el camino HTTP completo ---

test('POST /api/productos con cuerpo vacío responde 400 por precio ausente', async () => {
  const respuesta = await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({})
    .expect(400);
  assert.equal(respuesta.body.error, 'El precio no es válido');
});

test('POST /api/productos con precio booleano responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ nombre: 'Juguete', precio: true, stockActual: 5, stockMinimo: 1 })
    .expect(400);

  assert.equal(respuesta.body.error, 'El precio no es válido');
});

test('PUT /api/productos/:id con stockActual en el cuerpo responde 400 sin sobrescribir el stock', async () => {
  const respuesta = await request(app)
    .put('/api/productos/1')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Juguete',
      precio: 10,
      stockMinimo: 1,
      stockActual: 999,
    })
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'El stock no se modifica por esta vía: use PATCH /api/productos/:id/stock',
  );
});

test('PATCH /api/productos/:id/stock sin cuerpo responde 400', async () => {
  const respuesta = await request(app)
    .patch('/api/productos/1/stock')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({})
    .expect(400);

  assert.equal(respuesta.statusCode, 400);
});

test('PATCH /api/productos/:id/stock con cantidad cero responde 400', async () => {
  const respuesta = await request(app)
    .patch('/api/productos/1/stock')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ cantidad: 0 })
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'La cantidad del movimiento no puede ser cero',
  );
});

test('POST /api/productos sin token de autenticación responde 401', async () => {
  const respuesta = await request(app)
    .post('/api/productos')
    .send({ nombre: 'Juguete', precio: 10, stockActual: 5, stockMinimo: 1 })
    .expect(401);

  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});
