import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { agregarFavorito, quitarFavorito } from '../src/services/favorito.service.js';
import { tokenCliente, tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que direccionClienteEntradasInvalidas.test.js:
// estos casos deben rechazarse en validación (validarIdProducto) ANTES de
// tocar la base — ni siquiera para comprobar si el producto existe.
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;

let intentosDeQuery = 0;

before(() => {
  sequelize.transaction = () => {
    throw new Error('Protección de prueba: transacción real inesperada');
  };
  sequelize.query = () => {
    intentosDeQuery += 1;
    throw new Error('Protección de prueba: consulta real inesperada');
  };
  sequelize.connectionManager.getConnection = () => {
    throw new Error('Protección de prueba: conexión real inesperada');
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;

  assert.equal(intentosDeQuery, 0, 'no debía ejecutarse una consulta real');
});

test('agregarFavorito rechaza un idProducto ausente', async () => {
  await assert.rejects(
    () => agregarFavorito(7, undefined),
    (error) => error.statusCode === 400 && error.message === 'El ID del producto no es válido',
  );
});

test('agregarFavorito rechaza un idProducto no numérico', async () => {
  await assert.rejects(
    () => agregarFavorito(7, 'abc'),
    (error) => error.statusCode === 400 && error.message === 'El ID del producto no es válido',
  );
});

test('agregarFavorito rechaza un idProducto negativo', async () => {
  await assert.rejects(
    () => agregarFavorito(7, -1),
    (error) => error.statusCode === 400 && error.message === 'El ID del producto no es válido',
  );
});

test('agregarFavorito rechaza un idProducto cero', async () => {
  await assert.rejects(
    () => agregarFavorito(7, 0),
    (error) => error.statusCode === 400 && error.message === 'El ID del producto no es válido',
  );
});

test('quitarFavorito rechaza un idProducto no numérico', async () => {
  await assert.rejects(
    () => quitarFavorito(7, 'x'),
    (error) => error.statusCode === 400 && error.message === 'El ID del producto no es válido',
  );
});

test('GET /api/favoritos sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/favoritos').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/favoritos con token de vendedor (no cliente) responde 403', async () => {
  const respuesta = await request(app)
    .post('/api/favoritos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ idProducto: 1 })
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('POST /api/favoritos con cuerpo no es un objeto responde 400 antes de tocar la base', async () => {
  const respuesta = await request(app)
    .post('/api/favoritos')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .send([])
    .expect(400);

  assert.equal(respuesta.body.error, 'El cuerpo de la solicitud no es válido');
});

test('POST /api/favoritos con idProducto inválido responde 400 antes de tocar la base', async () => {
  const respuesta = await request(app)
    .post('/api/favoritos')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .send({ idProducto: 'no-es-un-id' })
    .expect(400);

  assert.equal(respuesta.body.error, 'El ID del producto no es válido');
});

test('DELETE /api/favoritos/:idProducto sin token responde 401', async () => {
  const respuesta = await request(app).delete('/api/favoritos/1').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('DELETE /api/favoritos/:idProducto con id inválido responde 400 antes de tocar la base', async () => {
  const respuesta = await request(app)
    .delete('/api/favoritos/no-es-un-id')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .expect(400);

  assert.equal(respuesta.body.error, 'El ID del producto no es válido');
});
