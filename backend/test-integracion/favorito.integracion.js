// Prueba de integración real contra petshop_test. No se ejecuta con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import Favorito from '../src/models/favorito.model.js';
import Producto from '../src/models/producto.model.js';
import { listarFavoritosPropios, agregarFavorito, quitarFavorito } from '../src/services/favorito.service.js';
import { eliminarProducto } from '../src/services/producto.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearProductoDePrueba,
  crearUsuarioDePrueba,
} from './ayudaIntegracion.js';

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
});

after(async () => {
  await sequelize.close();
});

test('sin favoritos guardados, listarFavoritosPropios devuelve un arreglo vacío', async () => {
  const cliente = await crearClienteDePrueba();
  const favoritos = await listarFavoritosPropios(cliente.idCliente);
  assert.deepEqual(favoritos, []);
});

test('agregarFavorito rechaza un producto inexistente', async () => {
  const cliente = await crearClienteDePrueba();

  await assert.rejects(
    () => agregarFavorito(cliente.idCliente, 999999),
    (error) => error.statusCode === 400 && error.message === 'El producto indicado no existe',
  );

  const cantidad = await Favorito.count({ where: { idCliente: cliente.idCliente } });
  assert.equal(cantidad, 0);
});

test('agrega un favorito real y aparece listado con los datos del producto', async () => {
  const cliente = await crearClienteDePrueba();
  const producto = await crearProductoDePrueba({ nombre: 'Alimento para gatos' });

  await agregarFavorito(cliente.idCliente, producto.idProducto);

  const favoritos = await listarFavoritosPropios(cliente.idCliente);
  assert.equal(favoritos.length, 1);
  assert.equal(favoritos[0].idProducto, producto.idProducto);
  assert.equal(favoritos[0].nombre, 'Alimento para gatos');
});

test('agregar el mismo favorito dos veces es idempotente (no crea una segunda fila)', async () => {
  const cliente = await crearClienteDePrueba();
  const producto = await crearProductoDePrueba();

  await agregarFavorito(cliente.idCliente, producto.idProducto);
  await agregarFavorito(cliente.idCliente, producto.idProducto);

  const cantidad = await Favorito.count({
    where: { idCliente: cliente.idCliente, idProducto: producto.idProducto },
  });
  assert.equal(cantidad, 1);
});

test('quitarFavorito elimina el favorito; quitarlo de nuevo no falla (no-op)', async () => {
  const cliente = await crearClienteDePrueba();
  const producto = await crearProductoDePrueba();

  await agregarFavorito(cliente.idCliente, producto.idProducto);
  await quitarFavorito(cliente.idCliente, producto.idProducto);

  const favoritos = await listarFavoritosPropios(cliente.idCliente);
  assert.deepEqual(favoritos, []);

  await assert.doesNotReject(() => quitarFavorito(cliente.idCliente, producto.idProducto));
});

test('los favoritos de un cliente no aparecen en el listado de otro', async () => {
  const clienteA = await crearClienteDePrueba({ nombre: 'Ana' });
  const clienteB = await crearClienteDePrueba({ nombre: 'Beto' });
  const producto = await crearProductoDePrueba();

  await agregarFavorito(clienteA.idCliente, producto.idProducto);

  const favoritosB = await listarFavoritosPropios(clienteB.idCliente);
  assert.deepEqual(favoritosB, []);
});

test('eliminar un producto con favoritos ya no falla por restricción de clave foránea (hallazgo real de Codex)', async () => {
  // Reproduce contra MySQL real el escenario que encontró Codex al revisar
  // esta etapa: sin borrar los favoritos del producto ANTES de borrar el
  // producto (mismo criterio ya aplicado a ImagenProducto, ver
  // producto.service.js#eliminarProducto), esto fallaba con
  // ForeignKeyConstraintError en vez de completarse — un producto sin
  // ninguna venta asociada (borrado legítimo) quedaba bloqueado solo por
  // haber sido marcado como favorito.
  const cliente = await crearClienteDePrueba();
  const producto = await crearProductoDePrueba({ nombre: 'Producto favorito sin ventas' });

  await agregarFavorito(cliente.idCliente, producto.idProducto);

  await eliminarProducto(producto.idProducto);

  assert.equal(await Producto.findByPk(producto.idProducto), null);
  assert.equal(await Favorito.count({ where: { idProducto: producto.idProducto } }), 0);
});

test('camino HTTP completo: POST agrega, GET lista solo lo propio, DELETE quita', async () => {
  const clienteA = await crearClienteDePrueba({ nombre: 'Ana', apellido: 'Gómez' });
  const usuarioA = await crearUsuarioDePrueba({ idCliente: clienteA.idCliente, password: 'ClaveDePrueba123' });
  const producto = await crearProductoDePrueba({ nombre: 'Collar antipulgas' });

  const agente = request.agent(app);
  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: usuarioA.email, password: 'ClaveDePrueba123' })
    .expect(200);

  await agente
    .post('/api/favoritos')
    .set('X-CSRF-Token', body.csrfToken)
    .send({ idProducto: producto.idProducto })
    .expect(204);

  const respuestaLista = await agente.get('/api/favoritos').expect(200);
  assert.equal(respuestaLista.body.length, 1);
  assert.equal(respuestaLista.body[0].idProducto, producto.idProducto);

  await agente
    .delete(`/api/favoritos/${producto.idProducto}`)
    .set('X-CSRF-Token', body.csrfToken)
    .expect(204);

  const respuestaListaVacia = await agente.get('/api/favoritos').expect(200);
  assert.deepEqual(respuestaListaVacia.body, []);
});
