import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { confirmarCompra } from '../src/services/compra.service.js';
import { tokenCliente, tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

// Mismo patrón de protección que ventaEntradasInvalidas.test.js: todos los
// casos de este archivo deben fallar en validación (forma, idempotencia,
// cotización, datos de tarjeta) antes de que confirmarCompra llegue a tocar
// la base — se interceptan los tres puntos de entrada reales de Sequelize
// hacia MySQL para demostrarlo, no solo suponerlo.
const transactionOriginal = sequelize.transaction;
const queryOriginal = sequelize.query;
const getConnectionOriginal = sequelize.connectionManager.getConnection;

let intentosReales = 0;

before(() => {
  sequelize.transaction = () => {
    intentosReales += 1;
    throw new Error('Protección de prueba: no se esperaba abrir una transacción real');
  };
  sequelize.query = () => {
    intentosReales += 1;
    throw new Error('Protección de prueba: no se esperaba ejecutar una consulta real');
  };
  sequelize.connectionManager.getConnection = () => {
    intentosReales += 1;
    throw new Error('Protección de prueba: no se esperaba adquirir una conexión real');
  };
});

after(() => {
  sequelize.transaction = transactionOriginal;
  sequelize.query = queryOriginal;
  sequelize.connectionManager.getConnection = getConnectionOriginal;

  assert.equal(intentosReales, 0, 'ninguna de estas pruebas debía tocar MySQL de verdad');
});

const cotizacionValida = {
  lineas: [{ idProducto: 1, cantidad: 1, precioFinalCentavos: 1000, idPromocionProducto: null }],
  totalCentavos: 1000,
  emitidaEn: new Date().toISOString(),
};

const cuerpoValidoBase = () => ({
  claveIdempotencia: 'a'.repeat(32),
  detalles: [{ idProducto: 1, cantidad: 1 }],
  tipoPagoSimulado: 'transferencia',
  cotizacionAceptada: cotizacionValida,
});

// --- confirmarCompra invocado directamente, sin HTTP ---

test('confirmarCompra rechaza un usuario que no es cliente', async () => {
  await assert.rejects(
    () => confirmarCompra(cuerpoValidoBase(), { rol: 'vendedor', idCliente: null }),
    (error) => error.statusCode === 403,
  );
});

test('confirmarCompra rechaza una clave de idempotencia ausente', async () => {
  const { claveIdempotencia, ...resto } = cuerpoValidoBase();
  await assert.rejects(
    () => confirmarCompra(resto, { rol: 'cliente', idCliente: 1 }),
    (error) => error.statusCode === 400 && /clave de idempotencia/.test(error.message),
  );
});

test('confirmarCompra rechaza una cotización aceptada ausente', async () => {
  const { cotizacionAceptada, ...resto } = cuerpoValidoBase();
  await assert.rejects(
    () => confirmarCompra(resto, { rol: 'cliente', idCliente: 1 }),
    (error) => error.statusCode === 400 && /cotización aceptada/.test(error.message),
  );
});

test('confirmarCompra rechaza un arreglo de detalles vacío', async () => {
  await assert.rejects(
    () => confirmarCompra({ ...cuerpoValidoBase(), detalles: [] }, { rol: 'cliente', idCliente: 1 }),
    (error) => error.statusCode === 400,
  );
});

// El formato de los datos de pago (tipo desconocido, tarjeta con menos de
// 16 dígitos, etc.) ya está cubierto exhaustivamente, en aislamiento total,
// por pagoSimulado.service.test.js. Acá NO se repite: a propósito, desde la
// corrección que reordenó cuándo se valida el pago (ver
// compra.service.js#confirmarCompra — un intento YA resuelto se devuelve
// sin llegar a mirar el pago del reintento, para poder recuperarse de una
// respuesta perdida aunque el formulario de pago se reinicie con datos
// inválidos), esa validación ocurre DENTRO de la transacción, después de
// consultar la idempotencia — así que ya no es un caso "sin tocar MySQL": es
// un caso de integración real, cubierto en
// test-integracion/compra.integracion.js.

test('confirmarCompra rechaza un método de entrega inválido', async () => {
  await assert.rejects(
    () =>
      confirmarCompra(
        { ...cuerpoValidoBase(), metodoEntrega: 'teletransporte' },
        { rol: 'cliente', idCliente: 1 },
      ),
    (error) => error.statusCode === 400,
  );
});

// --- capa HTTP: autenticación y autorización ---

test('POST /api/compras sin token responde 401', async () => {
  await request(app).post('/api/compras').send(cuerpoValidoBase()).expect(401);
});

test('POST /api/compras con un token de vendedor responde 403 (solo cliente)', async () => {
  await request(app)
    .post('/api/compras')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send(cuerpoValidoBase())
    .expect(403);
});

test('POST /api/compras/cotizacion con un token de vendedor responde 403 (solo cliente)', async () => {
  await request(app)
    .post('/api/compras/cotizacion')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ detalles: [{ idProducto: 1, cantidad: 1 }] })
    .expect(403);
});

test('POST /api/compras con un cuerpo mal formado responde 400 antes de tocar la base', async () => {
  await request(app)
    .post('/api/compras')
    .set('Authorization', autorizacion(tokenCliente()))
    .send({ ...cuerpoValidoBase(), claveIdempotencia: 'corta' })
    .expect(400);
});

test('GET /api/ventas/:id/comprobante/pdf sin token responde 401', async () => {
  await request(app).get('/api/ventas/1/comprobante/pdf').expect(401);
});

test('POST /api/ventas/:id/comprobante/reenviar-correo sin token responde 401', async () => {
  await request(app).post('/api/ventas/1/comprobante/reenviar-correo').expect(401);
});
