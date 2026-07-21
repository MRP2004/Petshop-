import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';

test('GET /api/health responde que la API funciona', async () => {
  const respuesta = await request(app)
    .get('/api/health')
    .expect(200);

  assert.deepEqual(respuesta.body, {
    status: 'ok',
    message: 'API Petshop funcionando correctamente',
  });
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