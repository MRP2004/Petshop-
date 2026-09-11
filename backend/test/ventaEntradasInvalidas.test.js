import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { registrarVenta } from '../src/services/venta.service.js';
import { tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

// Todos los casos de este archivo deben fallar en validación antes de que
// registrarVenta llegue a tocar la base (esa parte del código corre después
// de todas las comprobaciones de forma, IDs e importes). Como protección
// adicional se interceptan los tres puntos de entrada reales de Sequelize
// hacia MySQL: transacciones, consultas (de las que dependen findByPk,
// create, update, etc.) y adquisición de conexiones del pool. Cualquier
// intento real falla de inmediato en vez de intentar conectarse, y los tres
// métodos originales se restauran al terminar.
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

  assert.equal(
    intentosDeTransaccion,
    0,
    'ninguna de estas pruebas debía llegar a abrir una transacción real',
  );
  assert.equal(
    intentosDeQuery,
    0,
    'ninguna de estas pruebas debía llegar a ejecutar una consulta real',
  );
  assert.equal(
    intentosDeConexion,
    0,
    'ninguna de estas pruebas debía llegar a adquirir una conexión real',
  );
});

// --- registrarVenta invocado directamente (sin HTTP), sin tocar MySQL ---

test('registrarVenta rechaza un cuerpo null', async () => {
  await assert.rejects(
    () => registrarVenta(null),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo de la venta no es válido',
  );
});

test('registrarVenta rechaza un cuerpo que es un arreglo', async () => {
  await assert.rejects(
    () => registrarVenta([1, 2, 3]),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo de la venta no es válido',
  );
});

test('registrarVenta rechaza un cuerpo primitivo', async () => {
  await assert.rejects(
    () => registrarVenta('texto'),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El cuerpo de la venta no es válido',
  );
});

test('registrarVenta rechaza un cuerpo vacío por falta de idCliente', async () => {
  await assert.rejects(
    () => registrarVenta({}),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El ID del cliente no es válido',
  );
});

test('registrarVenta rechaza un detalle null dentro del arreglo', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [null],
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'Cada detalle de la venta debe ser un objeto válido',
  );
});

test('registrarVenta rechaza un arreglo de detalles vacío', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [],
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La venta debe contener al menos un producto',
  );
});

test('registrarVenta rechaza productos duplicados en los detalles', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [
          { idProducto: 1, cantidad: 1 },
          { idProducto: 1, cantidad: 2 },
        ],
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'Un producto no puede repetirse en la misma venta',
  );
});

test('registrarVenta rechaza una cantidad booleana', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: true }],
      }),
    (error) => error.statusCode === 400,
  );
});

test('registrarVenta rechaza un ID de producto fuera del rango de INTEGER', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 2147483648, cantidad: 1 }],
      }),
    (error) => error.statusCode === 400,
  );
});

test('registrarVenta rechaza un descuento negativo', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        descuento: -5,
      }),
    (error) =>
      error.statusCode === 400 && error.message === 'El descuento no es válido',
  );
});

test('registrarVenta rechaza un descuento que supera DECIMAL(10,2)', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        descuento: 100000000,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El descuento supera el máximo permitido',
  );
});

test('registrarVenta rechaza un mínimo mayorista booleano', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        minimoMayorista: true,
      }),
    (error) => error.statusCode === 400,
  );
});

test('registrarVenta rechaza un método de entrega que no sea uno de los dos reconocidos', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        metodoEntrega: 'x'.repeat(51),
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'El método de entrega debe ser uno de: retiro en sucursal, envío a domicilio',
  );
});

test('registrarVenta rechaza "envío a domicilio" sin dirección: no se puede confirmar sin domicilio', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        metodoEntrega: 'envío a domicilio',
      }),
    (error) =>
      error.statusCode === 400 &&
      /La dirección de entrega es obligatoria/.test(error.message),
  );
});

test('registrarVenta rechaza "envío a domicilio" con una dirección demasiado corta para ser real', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        metodoEntrega: 'envío a domicilio',
        direccionEntrega: 'Av. 1',
      }),
    (error) =>
      error.statusCode === 400 &&
      /La dirección de entrega es obligatoria/.test(error.message),
  );
});

test('registrarVenta rechaza una dirección de entrega que no sea una cadena de texto', async () => {
  await assert.rejects(
    () =>
      registrarVenta({
        idCliente: 1,
        idMedioPago: 1,
        detalles: [{ idProducto: 1, cantidad: 1 }],
        metodoEntrega: 'envío a domicilio',
        direccionEntrega: true,
      }),
    // El mensaje exacto lo arma limpiarCadenaOpcional (validacion.js), una
    // función genérica compartida por muchos campos con géneros distintos
    // ("El teléfono"/"La dirección"): "no es válido" no concuerda en
    // género con "La dirección de entrega". Es un detalle preexistente del
    // mensaje genérico (no introducido acá) que no se corrigió en esta
    // etapa para no tener que revisar el mensaje exacto de las demás
    // pruebas que dependen de él; queda registrado en docs/estado-proyecto.md.
    (error) => error.statusCode === 400 && error.message === 'La dirección de entrega no es válido',
  );
});

// --- Mismos casos representativos, pero por el camino HTTP completo
// (Express -> controlador -> servicio -> middleware de errores) ---

test('POST /api/ventas sin cuerpo (sin enviar nada) responde 400 por forma de cuerpo inválida', async () => {
  // A diferencia de .send({}), no llamar a .send() no manda Content-Type ni
  // cuerpo alguno: Express deja req.body === undefined (no {}), así que este
  // caso ejercita esObjetoPlano directamente, no la validación de idCliente.
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .expect(400);

  assert.equal(respuesta.body.error, 'El cuerpo de la venta no es válido');
});

test('POST /api/ventas sin token de autenticación responde 401', async () => {
  const respuesta = await request(app).post('/api/ventas').send({}).expect(401);

  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});

test('POST /api/ventas con el literal JSON null como cuerpo responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .set('Content-Type', 'application/json')
    .send('null')
    .expect(400);

  // El parser JSON estricto de Express (body-parser, modo strict por
  // defecto) rechaza "null" como cuerpo de nivel superior antes de que
  // llegue a registrarVenta: por eso el mensaje es el de "cuerpo JSON
  // inválido" ya existente, no el nuevo de forma de cuerpo. Confirmado
  // leyendo node_modules/body-parser/lib/types/json.js (solo "{" o "["
  // pasan el chequeo estricto).
  assert.equal(
    respuesta.body.error,
    'El cuerpo JSON de la solicitud no es válido',
  );
});

test('POST /api/ventas con cuerpo vacío ({}) responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({})
    .expect(400);

  assert.equal(respuesta.body.error, 'El ID del cliente no es válido');
});

test('POST /api/ventas con un arreglo como cuerpo responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send([1, 2, 3])
    .expect(400);

  assert.equal(respuesta.body.error, 'El cuerpo de la venta no es válido');
});

test('POST /api/ventas con un detalle null responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ idCliente: 1, idMedioPago: 1, detalles: [null] })
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'Cada detalle de la venta debe ser un objeto válido',
  );
});

test('POST /api/ventas con descuento fuera de rango de DECIMAL(10,2) responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      idCliente: 1,
      idMedioPago: 1,
      detalles: [{ idProducto: 1, cantidad: 1 }],
      descuento: 100000000,
    })
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'El descuento supera el máximo permitido',
  );
});

test('POST /api/ventas con cantidad booleana responde 400', async () => {
  await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      idCliente: 1,
      idMedioPago: 1,
      detalles: [{ idProducto: 1, cantidad: true }],
    })
    .expect(400);
});
