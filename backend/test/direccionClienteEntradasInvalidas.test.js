import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { guardarDireccionPropia } from '../src/services/direccionCliente.service.js';
import { tokenCliente, tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que el resto de "entradas inválidas": estos
// casos deben rechazarse en validación de forma ANTES de tocar la base o de
// llamarle a Georef (prepararDatosDireccion valida el cuerpo/la provincia
// antes de buscar la localidad). Se protege la base igual que en los otros
// archivos, y ADEMÁS se hace fallar `fetch` real si algo llega a intentar
// pedirle algo a Georef (no debería, para estos casos puntuales).
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;
const fetchOriginal = global.fetch;

let intentosDeQuery = 0;
let intentosDeFetch = 0;

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
  global.fetch = () => {
    intentosDeFetch += 1;
    throw new Error('Protección de prueba: no se esperaba pedirle nada a Georef');
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;
  global.fetch = fetchOriginal;

  assert.equal(intentosDeQuery, 0, 'no debía ejecutarse una consulta real');
  assert.equal(intentosDeFetch, 0, 'no debía llamarse a Georef para estos casos');
});

test('guardarDireccionPropia rechaza un cuerpo null', async () => {
  await assert.rejects(
    () => guardarDireccionPropia(7, null),
    (error) => error.statusCode === 400 && error.message === 'El cuerpo de la dirección no es válido',
  );
});

test('guardarDireccionPropia rechaza una provincia ausente', async () => {
  await assert.rejects(
    () => guardarDireccionPropia(7, { idLocalidad: '82084270', calle: 'San Martín', numero: '123' }),
    (error) => error.statusCode === 400 && error.message === 'La provincia indicada no existe',
  );
});

test('guardarDireccionPropia rechaza una provincia inventada', async () => {
  await assert.rejects(
    () =>
      guardarDireccionPropia(7, {
        idProvincia: '99',
        idLocalidad: '82084270',
        calle: 'San Martín',
        numero: '123',
      }),
    (error) => error.statusCode === 400 && error.message === 'La provincia indicada no existe',
  );
});

test('PUT /api/clientes/direccion sin token responde 401', async () => {
  const respuesta = await request(app).put('/api/clientes/direccion').send({}).expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('PUT /api/clientes/direccion con token de vendedor (no cliente) responde 403', async () => {
  const respuesta = await request(app)
    .put('/api/clientes/direccion')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ idProvincia: '82' })
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('PUT /api/clientes/direccion con provincia inventada responde 400 antes de tocar Georef/la base', async () => {
  const respuesta = await request(app)
    .put('/api/clientes/direccion')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .send({ idProvincia: '99', idLocalidad: 'x', calle: 'San Martín', numero: '123' })
    .expect(400);

  assert.equal(respuesta.body.error, 'La provincia indicada no existe');
});

test('GET /api/clientes/direccion sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/clientes/direccion').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});
