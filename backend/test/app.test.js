import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import { tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

test('GET /api/health responde que la API funciona', async () => {
  const respuesta = await request(app)
    .get('/api/health')
    .expect(200);

  assert.deepEqual(respuesta.body, {
    status: 'ok',
    message: 'API Petshop funcionando correctamente',
    // "desarrollo" es el valor por defecto cuando ENTORNO no está definida
    // (como en las pruebas, que no cargan .env.e2e/.env.test) — ver
    // ENTORNO en app.js y docs/backend-base-de-datos.md.
    entorno: 'desarrollo',
  });
});

// Corrección de una revisión posterior: /api/health/aislamiento expone
// nombre de base y usuario de conexión (no son credenciales, pero tampoco
// hace falta que cualquier instancia los conteste) — solo debe estar
// habilitado cuando ENTORNO=e2e. En esta suite ENTORNO nunca está
// definida (ver la prueba de /api/health arriba).
test('GET /api/health/aislamiento fuera de ENTORNO=e2e responde 404 sin consultar la base', async () => {
  const queryOriginal = sequelize.query;
  let seLlamoQuery = false;
  // Espía explícito (revisión independiente, Codex): antes esto se
  // probaba solo de forma indirecta (si igual llegara a consultar,
  // fallaría con un error real contra una base no configurada) — correcto,
  // pero no demostraba "sin consultar" de forma literal. Esto sí.
  sequelize.query = async (...argumentos) => {
    seLlamoQuery = true;
    return queryOriginal.apply(sequelize, argumentos);
  };

  try {
    const respuesta = await request(app)
      .get('/api/health/aislamiento')
      .expect(404);

    assert.deepEqual(respuesta.body, { error: 'Ruta no encontrada' });
    assert.equal(seLlamoQuery, false);
  } finally {
    sequelize.query = queryOriginal;
  }
});

test('GET /api/health/aislamiento con ENTORNO=e2e sí consulta y expone base/usuario', async () => {
  const entornoOriginal = process.env.ENTORNO;
  const queryOriginal = sequelize.query;

  process.env.ENTORNO = 'e2e';
  // Mismo patrón que productoImagen.test.js: se reemplaza el método real
  // por uno que devuelve una fila fija, para probar la ruta habilitada sin
  // necesitar una base real (esta suite corre sin MySQL, ver
  // .github/workflows/backend-tests.yml).
  sequelize.query = async () => [
    [{ baseDeDatos: 'petshop_e2e', usuarioConexion: 'petshop_e2e_app@localhost' }],
  ];

  try {
    const respuesta = await request(app)
      .get('/api/health/aislamiento')
      .expect(200);

    assert.deepEqual(respuesta.body, {
      entorno: 'e2e',
      baseDeDatos: 'petshop_e2e',
      usuarioConexion: 'petshop_e2e_app@localhost',
    });
  } finally {
    process.env.ENTORNO = entornoOriginal;
    sequelize.query = queryOriginal;
  }
});

test('una ruta inexistente responde 404', async () => {
  const respuesta = await request(app)
    .get('/api/ruta-inexistente')
    .expect(404);

  assert.equal(
    respuesta.body.error,
    'Ruta no encontrada',
  );
});

test('un cuerpo JSON inválido responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/clientes')
    .set('Content-Type', 'application/json')
    .send('{"nombre":"Mauro",}')
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'El cuerpo JSON de la solicitud no es válido',
  );
});

test('un cliente con nombre inválido responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/clientes')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'A',
      apellido: 'Perez',
    })
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'El nombre debe contener entre 2 y 50 caracteres',
  );
});