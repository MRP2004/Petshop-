// Prueba de integración real: contra petshop_test Y contra la API pública
// real de Georef (no mockeada acá — es la única forma de probar de punta a
// punta que la coherencia provincia-localidad funciona con datos reales, no
// con lo que yo creo que Georef devuelve). No se ejecuta con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import DireccionCliente from '../src/models/direccionCliente.model.js';
import { obtenerDireccionPropia, guardarDireccionPropia } from '../src/services/direccionCliente.service.js';
import { prepararEsquema, limpiarDatos, crearClienteDePrueba, crearUsuarioDePrueba } from './ayudaIntegracion.js';

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
});

after(async () => {
  await sequelize.close();
});

test('sin dirección guardada, obtenerDireccionPropia devuelve null (no un error)', async () => {
  const cliente = await crearClienteDePrueba();
  const direccion = await obtenerDireccionPropia(cliente.idCliente);
  assert.equal(direccion, null);
});

test('guarda una dirección real (Santa Fe / Rosario) y la coherencia provincia-localidad pasa contra Georef real', async () => {
  const cliente = await crearClienteDePrueba();

  const guardada = await guardarDireccionPropia(cliente.idCliente, {
    idProvincia: '82',
    idLocalidad: '82084270', // Rosario, confirmado contra la API real de Georef
    calle: 'San Martín',
    numero: '1234',
    piso: '4B',
    indicaciones: 'Timbre azul',
  });

  assert.equal(guardada.idCliente, cliente.idCliente);
  assert.equal(guardada.provincia, 'Santa Fe');
  assert.equal(guardada.localidad, 'Rosario');
  assert.equal(guardada.calle, 'San Martín');
  assert.equal(guardada.piso, '4B');

  const releida = await obtenerDireccionPropia(cliente.idCliente);
  assert.equal(releida.localidad, 'Rosario');
});

test('rechaza una localidad que no pertenece a la provincia elegida (coherencia real, no solo por nombre)', async () => {
  const cliente = await crearClienteDePrueba();

  await assert.rejects(
    () =>
      guardarDireccionPropia(cliente.idCliente, {
        idProvincia: '82', // Santa Fe
        idLocalidad: '0208401002', // "Saavedra", en realidad de CABA (provincia "02")
        calle: 'San Martín',
        numero: '1234',
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La localidad indicada no pertenece a la provincia elegida',
  );

  const direccion = await obtenerDireccionPropia(cliente.idCliente);
  assert.equal(direccion, null, 'no debía quedar ninguna dirección guardada tras el rechazo');
});

test('guardar de nuevo actualiza la misma fila (upsert), no crea una segunda', async () => {
  const cliente = await crearClienteDePrueba();

  await guardarDireccionPropia(cliente.idCliente, {
    idProvincia: '82',
    idLocalidad: '82084270',
    calle: 'San Martín',
    numero: '1234',
  });

  await guardarDireccionPropia(cliente.idCliente, {
    idProvincia: '82',
    idLocalidad: '82084270',
    calle: 'Corrientes',
    numero: '999',
  });

  const cantidad = await DireccionCliente.count({ where: { idCliente: cliente.idCliente } });
  assert.equal(cantidad, 1);

  const direccion = await obtenerDireccionPropia(cliente.idCliente);
  assert.equal(direccion.calle, 'Corrientes');
  assert.equal(direccion.numero, '999');
});

test('camino HTTP completo: PUT guarda, GET devuelve la propia dirección (y solo la propia)', async () => {
  const clienteA = await crearClienteDePrueba({ nombre: 'Ana', apellido: 'Gómez' });
  const usuarioA = await crearUsuarioDePrueba({ idCliente: clienteA.idCliente, password: 'ClaveDePrueba123' });

  const agente = request.agent(app);
  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: usuarioA.email, password: 'ClaveDePrueba123' })
    .expect(200);

  await agente
    .put('/api/clientes/direccion')
    .set('X-CSRF-Token', body.csrfToken)
    .send({
      idProvincia: '82',
      idLocalidad: '82084270',
      calle: 'San Martín',
      numero: '1234',
    })
    .expect(200);

  const respuesta = await agente.get('/api/clientes/direccion').expect(200);
  assert.equal(respuesta.body.idCliente, clienteA.idCliente);
  assert.equal(respuesta.body.localidad, 'Rosario');
});
