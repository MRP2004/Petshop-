import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { crearCliente, actualizarCliente } from '../src/services/cliente.service.js';
import { crearProveedor, actualizarProveedor } from '../src/services/proveedor.service.js';
import { crearCategoria, actualizarCategoria } from '../src/services/categoria.service.js';
import {
  crearTipoMascota,
  actualizarTipoMascota,
} from '../src/services/tipoMascota.service.js';
import { crearMedioPago, actualizarMedioPago } from '../src/services/medioPago.service.js';
import { tokenVendedor, tokenCliente, autorizacion } from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que en los otros archivos de "entradas
// inválidas": todos estos casos deben fallar en validación de forma antes de
// tocar la base (las funciones crear* validan antes de Model.create; las
// actualizar* ahora validan el cuerpo antes de buscar el registro, ver el
// reordenamiento aplicado en esta etapa). Se interceptan los tres puntos de
// entrada reales de Sequelize hacia MySQL.
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;

let intentosDeTransaccion = 0;
let intentosDeQuery = 0;
let intentosDeConexion = 0;

before(() => {
  sequelize.transaction = () => {
    intentosDeTransaccion += 1;
    throw new Error('Protección de prueba: transacción real inesperada');
  };
  sequelize.query = () => {
    intentosDeQuery += 1;
    throw new Error('Protección de prueba: consulta real inesperada');
  };
  sequelize.connectionManager.getConnection = () => {
    intentosDeConexion += 1;
    throw new Error('Protección de prueba: conexión real inesperada');
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

// --- Cliente ---

test('crearCliente rechaza cuerpo null y arreglo', async () => {
  await assert.rejects(
    () => crearCliente(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del cliente no es válido',
  );
  await assert.rejects(
    () => crearCliente([1, 2]),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del cliente no es válido',
  );
});

test('crearCliente rechaza un cuerpo vacío por nombre ausente', async () => {
  await assert.rejects(
    () => crearCliente({}),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El nombre debe contener entre 2 y 50 caracteres',
  );
});

test('actualizarCliente rechaza cuerpo null antes de buscar el cliente', async () => {
  await assert.rejects(
    () => actualizarCliente(1, null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del cliente no es válido',
  );
});

// --- Proveedor ---

test('crearProveedor rechaza cuerpo null y arreglo', async () => {
  await assert.rejects(
    () => crearProveedor(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del proveedor no es válido',
  );
  await assert.rejects(
    () => crearProveedor([1]),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del proveedor no es válido',
  );
});

test('crearProveedor rechaza un cuerpo vacío por descripción ausente', async () => {
  await assert.rejects(
    () => crearProveedor({}),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La descripción debe contener entre 2 y 100 caracteres',
  );
});

test('actualizarProveedor rechaza cuerpo null antes de buscar el proveedor', async () => {
  await assert.rejects(
    () => actualizarProveedor(1, null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo del proveedor no es válido',
  );
});

// --- Categoría ---

test('crearCategoria rechaza cuerpo null y arreglo', async () => {
  await assert.rejects(
    () => crearCategoria(null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la categoría no es válido',
  );
  await assert.rejects(
    () => crearCategoria(['x']),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la categoría no es válido',
  );
});

test('actualizarCategoria rechaza cuerpo null antes de buscar la categoría', async () => {
  await assert.rejects(
    () => actualizarCategoria(1, null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la categoría no es válido',
  );
});

// --- Tipo de mascota ---

test('crearTipoMascota rechaza cuerpo null y arreglo', async () => {
  await assert.rejects(
    () => crearTipoMascota(null),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del tipo de mascota no es válido',
  );
  await assert.rejects(
    () => crearTipoMascota([]),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del tipo de mascota no es válido',
  );
});

test('actualizarTipoMascota rechaza cuerpo null antes de buscar el tipo de mascota', async () => {
  await assert.rejects(
    () => actualizarTipoMascota(1, null),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del tipo de mascota no es válido',
  );
});

// --- Medio de pago ---

test('crearMedioPago rechaza cuerpo null y arreglo', async () => {
  await assert.rejects(
    () => crearMedioPago(null),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del medio de pago no es válido',
  );
  await assert.rejects(
    () => crearMedioPago([true]),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del medio de pago no es válido',
  );
});

test('crearMedioPago rechaza un habilitado que no sea verdadero/falso reconocible', async () => {
  await assert.rejects(
    () => crearMedioPago({ nombre: 'Efectivo', habilitado: 'tal-vez' }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El campo habilitado debe ser verdadero o falso',
  );
});

test('actualizarMedioPago rechaza cuerpo null antes de buscar el medio de pago', async () => {
  await assert.rejects(
    () => actualizarMedioPago(1, null),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo del medio de pago no es válido',
  );
});

// --- Camino HTTP completo, un caso representativo por entidad ---

test('POST /api/clientes con un arreglo como cuerpo responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/clientes')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send([1, 2])
    .expect(400);
  assert.equal(respuesta.body.error, 'El cuerpo del cliente no es válido');
});

test('PUT /api/proveedores/:id con el literal JSON null como cuerpo responde 400', async () => {
  const respuesta = await request(app)
    .put('/api/proveedores/1')
    .set('Authorization', autorizacion(tokenVendedor()))
    .set('Content-Type', 'application/json')
    .send('null')
    .expect(400);

  // Igual que con ventas: el parser estricto de Express intercepta "null" a
  // nivel de cuerpo antes de que el controlador (o el middleware de
  // autenticación) lo reciba.
  assert.equal(respuesta.body.error, 'El cuerpo JSON de la solicitud no es válido');
});

test('POST /api/categorias sin cuerpo responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/categorias')
    .set('Authorization', autorizacion(tokenVendedor()))
    .expect(400);
  assert.equal(respuesta.statusCode, 400);
});

test('POST /api/tipos-mascota con cuerpo vacío responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/tipos-mascota')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({})
    .expect(400);
  assert.equal(respuesta.body.error, 'El nombre debe contener entre 2 y 50 caracteres');
});

test('POST /api/medios-pago con habilitado inválido responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/medios-pago')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ nombre: 'Tarjeta', habilitado: 'tal-vez' })
    .expect(400);

  assert.equal(respuesta.body.error, 'El campo habilitado debe ser verdadero o falso');
});

test('POST /api/clientes sin token de autenticación responde 401', async () => {
  const respuesta = await request(app)
    .post('/api/clientes')
    .send({ nombre: 'Ana', apellido: 'Pérez' })
    .expect(401);

  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/proveedores con token de cliente (no personal) responde 403', async () => {
  const respuesta = await request(app)
    .post('/api/proveedores')
    .set('Authorization', autorizacion(tokenCliente()))
    .send({ descripcion: 'Proveedor de prueba' })
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

// --- Punto 8: un tipo inválido en un campo opcional no debe tratarse como
// ausencia (antes, email: true se convertía silenciosamente en null) ---

test('crearCliente rechaza un email booleano en vez de tratarlo como ausente', async () => {
  await assert.rejects(
    () =>
      crearCliente({
        nombre: 'Ana',
        apellido: 'Pérez',
        email: true,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El correo electrónico no es válido',
  );
});

test('POST /api/clientes con email: true responde 400, no crea el cliente con email null', async () => {
  const respuesta = await request(app)
    .post('/api/clientes')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ nombre: 'Ana', apellido: 'Pérez', email: true })
    .expect(400);

  assert.equal(respuesta.body.error, 'El correo electrónico no es válido');
});

test('crearProveedor rechaza un CUIT numérico en vez de tratarlo como ausente', async () => {
  await assert.rejects(
    () =>
      crearProveedor({
        descripcion: 'Proveedor de prueba',
        CUIT: 30123456789, // número, no cadena
      }),
    (error) => error.statusCode === 400 && error.message === 'El CUIT no es válido',
  );
});
