import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import {
  crearPromocion,
  actualizarPromocion,
  prepararDatosPromocion,
} from '../src/services/promocionProducto.service.js';
import {
  tokenAdministrador,
  tokenCliente,
  autorizacion,
} from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que en los otros archivos de "entradas
// inválidas": todos estos casos deben fallar en validación antes de tocar
// la base (prepararDatos corre antes que comprobarRelaciones).
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

// --- Validación de calendario real (punto 6 de la revisión) ---

test('crearPromocion rechaza el 30 de febrero (no existe, y Date de JS lo "corrige" en silencio al 2 de marzo)', async () => {
  await assert.rejects(
    () =>
      crearPromocion({
        fechaInicio: '2026-02-30',
        fechaFin: '2026-03-15',
        descuento: 10,
        idProducto: 1,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La fecha de inicio no es una fecha de calendario válida',
  );
});

test('crearPromocion rechaza el 31 de abril (abril tiene 30 días)', async () => {
  await assert.rejects(
    () =>
      crearPromocion({
        fechaInicio: '2026-04-01',
        fechaFin: '2026-04-31',
        descuento: 10,
        idProducto: 1,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La fecha de fin no es una fecha de calendario válida',
  );
});

test('crearPromocion rechaza el mes 13', async () => {
  await assert.rejects(
    () =>
      crearPromocion({
        fechaInicio: '2026-13-01',
        fechaFin: '2026-13-15',
        descuento: 10,
        idProducto: 1,
      }),
    (error) => error.statusCode === 400,
  );
});

test('prepararDatosPromocion acepta el 29 de febrero en un año bisiesto (2028), sin tocar la base', () => {
  const datos = prepararDatosPromocion({
    fechaInicio: '2028-02-29',
    fechaFin: '2028-03-01',
    descuento: 10,
    idProducto: 1,
  });

  assert.equal(datos.fechaInicio, '2028-02-29');
});

test('prepararDatosPromocion acepta los límites inclusivos de porcentaje y ya no prepara categoría', () => {
  const minimo = prepararDatosPromocion({
    fechaInicio: '2028-02-29',
    fechaFin: '2028-03-01',
    descuento: 1,
    idProducto: 1,
    idCategoria: 7,
  });
  const maximo = prepararDatosPromocion({
    fechaInicio: '2028-02-29',
    fechaFin: '2028-03-01',
    descuento: 100,
    idProducto: 1,
  });

  assert.equal(minimo.descuento, '1.00');
  assert.equal(maximo.descuento, '100.00');
  assert.equal(Object.hasOwn(minimo, 'idCategoria'), false);
});

test('prepararDatosPromocion rechaza porcentajes inferiores a 1 o superiores a 100', () => {
  for (const descuento of [0, 0.99, 100.01, 999.99]) {
    assert.throws(
      () =>
        prepararDatosPromocion({
          fechaInicio: '2028-02-29',
          fechaFin: '2028-03-01',
          descuento,
          idProducto: 1,
        }),
      (error) =>
        error.statusCode === 400 &&
        error.message === 'El descuento debe ser un porcentaje entre 1 y 100',
    );
  }
});

test('prepararDatosPromocion rechaza porcentajes con más de dos decimales', () => {
  assert.throws(
    () =>
      prepararDatosPromocion({
        fechaInicio: '2028-02-29',
        fechaFin: '2028-03-01',
        descuento: '1.001',
        idProducto: 1,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El descuento debe ser un porcentaje entre 1 y 100',
  );
});

test('la gestión de promociones requiere personal autenticado', async () => {
  await request(app).get('/api/promociones/gestion').expect(401);
  await request(app)
    .get('/api/promociones/gestion')
    .set('Authorization', autorizacion(tokenCliente()))
    .expect(403);
});

test('crearPromocion rechaza el 29 de febrero en un año NO bisiesto (2026)', async () => {
  await assert.rejects(
    () =>
      crearPromocion({
        fechaInicio: '2026-02-29',
        fechaFin: '2026-03-01',
        descuento: 10,
        idProducto: 1,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La fecha de inicio no es una fecha de calendario válida',
  );
});

test('actualizarPromocion también valida el calendario real antes de tocar la base', async () => {
  await assert.rejects(
    () =>
      actualizarPromocion(1, {
        fechaInicio: '2026-06-31', // junio tiene 30 días
        fechaFin: '2026-07-01',
        descuento: 10,
        idProducto: 1,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La fecha de inicio no es una fecha de calendario válida',
  );
});

test('POST /api/promociones con una fecha de calendario inválida responde 400 por HTTP', async () => {
  const respuesta = await request(app)
    .post('/api/promociones')
    .set('Authorization', autorizacion(tokenAdministrador()))
    .send({
      fechaInicio: '2026-02-30',
      fechaFin: '2026-03-01',
      descuento: 10,
      idProducto: 1,
    })
    .expect(400);

  assert.equal(respuesta.body.error, 'La fecha de inicio no es una fecha de calendario válida');
});
