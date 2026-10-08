import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { marcarComoLeido } from '../src/services/aviso.service.js';
import { tokenCliente, autorizacion } from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que favoritoEntradasInvalidas.test.js: estos
// casos deben rechazarse en validación (validarIdAviso) ANTES de tocar la
// base.
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

test('marcarComoLeido rechaza un idAviso no numérico', async () => {
  await assert.rejects(
    () => marcarComoLeido(7, 'abc'),
    (error) => error.statusCode === 400 && error.message === 'El ID del aviso no es válido',
  );
});

test('marcarComoLeido rechaza un idAviso cero o negativo', async () => {
  await assert.rejects(
    () => marcarComoLeido(7, 0),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    () => marcarComoLeido(7, -3),
    (error) => error.statusCode === 400,
  );
});

test('GET /api/avisos sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/avisos').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/avisos/:idAviso/leido sin token responde 401', async () => {
  const respuesta = await request(app).post('/api/avisos/1/leido').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/avisos/:idAviso/leido con id inválido responde 400 antes de tocar la base', async () => {
  const respuesta = await request(app)
    .post('/api/avisos/no-es-un-id/leido')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .expect(400);

  assert.equal(respuesta.body.error, 'El ID del aviso no es válido');
});

test('POST /api/avisos/leidos sin token responde 401', async () => {
  const respuesta = await request(app).post('/api/avisos/leidos').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});
