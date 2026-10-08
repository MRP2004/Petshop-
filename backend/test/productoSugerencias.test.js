import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { obtenerSugerenciasBusqueda } from '../src/services/producto.service.js';

// Buscador predictivo del encabezado (ronda 2, ver docs/frontend-diseno.md):
// GET /api/productos/sugerencias, público. Igual que
// productoEntradasInvalidas.test.js, se protege que un término vacío/ausente
// no toque la base en absoluto (el servicio corta antes con un `return []`) y
// que un tipo de dato inválido se rechace también antes de tocarla. El caso
// de un término real que sí encuentra productos (y que sí excluye
// "Alimento de prueba") se prueba contra una base real en
// test-integracion/productoSugerencias.integracion.js — acá no hay ninguna
// base disponible para eso.
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;

let intentosDeQuery = 0;

before(() => {
  sequelize.transaction = () => {
    throw new Error('Protección de prueba: no se esperaba abrir una transacción real contra MySQL');
  };

  sequelize.query = () => {
    intentosDeQuery += 1;
    throw new Error('Protección de prueba: no se esperaba ejecutar una consulta real contra MySQL');
  };

  sequelize.connectionManager.getConnection = () => {
    throw new Error('Protección de prueba: no se esperaba adquirir una conexión real contra MySQL');
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;

  assert.equal(intentosDeQuery, 0, 'no debía ejecutarse una consulta real');
});

test('obtenerSugerenciasBusqueda sin término devuelve [] sin tocar la base', async () => {
  const resultado = await obtenerSugerenciasBusqueda({});
  assert.deepEqual(resultado, []);
});

test('obtenerSugerenciasBusqueda con término vacío devuelve [] sin tocar la base', async () => {
  const resultado = await obtenerSugerenciasBusqueda({ q: '   ' });
  assert.deepEqual(resultado, []);
});

test('obtenerSugerenciasBusqueda rechaza un término que no es texto', async () => {
  await assert.rejects(
    () => obtenerSugerenciasBusqueda({ q: ['alimento'] }),
    (error) => error.statusCode === 400 && error.message === 'El término de búsqueda no es válido',
  );
});

test('GET /api/productos/sugerencias sin query devuelve 200 y []', async () => {
  const respuesta = await request(app).get('/api/productos/sugerencias').expect(200);
  assert.deepEqual(respuesta.body, []);
});

test('GET /api/productos/sugerencias es público (sin token) y no rompe con q ausente', async () => {
  const respuesta = await request(app).get('/api/productos/sugerencias?q=').expect(200);
  assert.deepEqual(respuesta.body, []);
});
