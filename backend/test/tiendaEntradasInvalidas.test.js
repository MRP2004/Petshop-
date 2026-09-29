import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { solicitarSerVendedor, cambiarEstadoTienda } from '../src/services/tienda.service.js';
import { tokenCliente, tokenVendedor, tokenAdministrador, tokenVendedorIndependiente, autorizacion } from './ayudaAutenticacion.js';

// Mismo mecanismo de protección que favoritoEntradasInvalidas.test.js: estos
// casos deben rechazarse en validación ANTES de tocar la base.
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

test('solicitarSerVendedor rechaza un CUIL/CUIT con formato inválido', async () => {
  await assert.rejects(
    () => solicitarSerVendedor(
      { nombreTienda: 'Mi Tienda', tipoDocumento: 'CUIL', numeroDocumento: '123' },
      { idUsuario: 7, rol: 'cliente', idCliente: 7 },
    ),
    (error) => error.statusCode === 400,
  );
});

test('solicitarSerVendedor rechaza un tipoDocumento desconocido', async () => {
  await assert.rejects(
    () => solicitarSerVendedor(
      { nombreTienda: 'Mi Tienda', tipoDocumento: 'DNI', numeroDocumento: '20172543597' },
      { idUsuario: 7, rol: 'cliente', idCliente: 7 },
    ),
    (error) => error.statusCode === 400,
  );
});

test('solicitarSerVendedor rechaza a quien no es cliente (personal interno, vendedor independiente)', async () => {
  await assert.rejects(
    () => solicitarSerVendedor(
      { nombreTienda: 'Mi Tienda', tipoDocumento: 'CUIL', numeroDocumento: '20172543597' },
      { idUsuario: 7, rol: 'vendedor', idCliente: null },
    ),
    (error) => error.statusCode === 403,
  );
});

test('cambiarEstadoTienda rechaza un estado que no sea "activa"/"suspendida"', async () => {
  await assert.rejects(
    () => cambiarEstadoTienda(1, 'eliminada', { idUsuario: 1, rol: 'administrador' }),
    (error) => error.statusCode === 400,
  );
});

test('POST /api/solicitudes-vendedor sin token responde 401', async () => {
  const respuesta = await request(app).post('/api/solicitudes-vendedor').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/solicitudes-vendedor con token de vendedor (personal interno) responde 403', async () => {
  const respuesta = await request(app)
    .post('/api/solicitudes-vendedor')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ nombreTienda: 'X', tipoDocumento: 'CUIL', numeroDocumento: '20172543597' })
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('GET /api/solicitudes-vendedor con token de cliente responde 403 (exclusivo administrador)', async () => {
  const respuesta = await request(app)
    .get('/api/solicitudes-vendedor')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('GET /api/tiendas/propia sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/tiendas/propia').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('GET /api/tiendas/propia con token de cliente (no vendedor independiente) responde 403', async () => {
  const respuesta = await request(app)
    .get('/api/tiendas/propia')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('GET /api/tiendas (administración) con token de vendedor independiente responde 403 (exclusivo administrador)', async () => {
  const respuesta = await request(app)
    .get('/api/tiendas')
    .set('Authorization', autorizacion(tokenVendedorIndependiente()))
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('PATCH /api/tiendas/:id/estado con token de administrador y estado inválido responde 400 antes de tocar la base', async () => {
  const respuesta = await request(app)
    .patch('/api/tiendas/1/estado')
    .set('Authorization', autorizacion(tokenAdministrador()))
    .send({ estado: 'eliminada' })
    .expect(400);

  assert.equal(respuesta.body.error, 'El estado debe ser "activa" o "suspendida"');
});
