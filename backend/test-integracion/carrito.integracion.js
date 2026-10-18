// Prueba de integración real contra petshop_test. No se ejecuta con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import ItemCarrito from '../src/models/itemCarrito.model.js';
import {
  tokenCliente,
  tokenVendedor,
  tokenVendedorIndependiente,
  tokenAdministrador,
  autorizacion,
} from '../test/ayudaAutenticacion.js';
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

test('las rutas del carrito requieren autenticación', async () => {
  await request(app).get('/api/carrito').expect(401);
  await request(app).post('/api/carrito/items').send({ idProducto: 1 }).expect(401);
});

test('GET devuelve el carrito vacío cuando la cuenta todavía no agregó productos', async () => {
  const usuario = await crearUsuarioDePrueba();

  const respuesta = await request(app)
    .get('/api/carrito')
    .set('Authorization', autorizacion(tokenCliente(usuario.idCliente, usuario.idUsuario)))
    .expect(200);

  assert.deepEqual(respuesta.body, { items: [] });
});

test('agregar, cambiar cantidad, quitar y vaciar persisten el carrito propio', async () => {
  const usuario = await crearUsuarioDePrueba();
  const producto = await crearProductoDePrueba({
    nombre: 'Alimento de prueba',
    precio: '1250.00',
    stockActual: 1,
  });
  const autorizacionUsuario = autorizacion(tokenCliente(usuario.idCliente, usuario.idUsuario));
  const ruta = '/api/carrito';

  const agregado = await request(app)
    .post(`${ruta}/items`)
    .set('Authorization', autorizacionUsuario)
    .send({ idProducto: producto.idProducto, cantidad: 2 })
    .expect(200);

  assert.equal(agregado.body.items.length, 1);
  assert.equal(agregado.body.items[0].producto.nombre, 'Alimento de prueba');
  assert.equal(agregado.body.items[0].cantidad, 2);

  const incrementado = await request(app)
    .post(`${ruta}/items`)
    .set('Authorization', autorizacionUsuario)
    .send({ idProducto: producto.idProducto, cantidad: 1 })
    .expect(200);
  assert.equal(incrementado.body.items[0].cantidad, 3);

  const actualizado = await request(app)
    .put(`${ruta}/items/${producto.idProducto}`)
    .set('Authorization', autorizacionUsuario)
    .send({ cantidad: 4 })
    .expect(200);
  assert.equal(actualizado.body.items[0].cantidad, 4);

  const persistido = await request(app)
    .get(ruta)
    .set('Authorization', autorizacionUsuario)
    .expect(200);
  assert.equal(persistido.body.items[0].cantidad, 4);

  const quitado = await request(app)
    .delete(`${ruta}/items/${producto.idProducto}`)
    .set('Authorization', autorizacionUsuario)
    .expect(200);
  assert.deepEqual(quitado.body, { items: [] });

  await request(app)
    .post(`${ruta}/items`)
    .set('Authorization', autorizacionUsuario)
    .send({ idProducto: producto.idProducto, cantidad: 1 })
    .expect(200);
  await request(app).delete(ruta).set('Authorization', autorizacionUsuario).expect(204);
  assert.equal(await ItemCarrito.count({ where: { idUsuario: usuario.idUsuario } }), 0);
});

test('cada rol autenticado accede solo a su carrito', async () => {
  const cliente = await crearUsuarioDePrueba();
  const vendedor = await crearUsuarioDePrueba({ rol: 'vendedor', idCliente: null });
  const vendedorIndependiente = await crearUsuarioDePrueba({ rol: 'vendedor_independiente' });
  const administrador = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  const producto = await crearProductoDePrueba();

  const actores = [
    {
      usuario: cliente,
      token: tokenCliente(cliente.idCliente, cliente.idUsuario),
    },
    {
      usuario: vendedor,
      token: tokenVendedor(vendedor.idUsuario),
    },
    {
      usuario: vendedorIndependiente,
      token: tokenVendedorIndependiente(
        vendedorIndependiente.idCliente,
        1,
        vendedorIndependiente.idUsuario,
      ),
    },
    {
      usuario: administrador,
      token: tokenAdministrador(administrador.idUsuario),
    },
  ];

  for (const [indice, { usuario, token }] of actores.entries()) {
    await request(app)
      .post('/api/carrito/items')
      .set('Authorization', autorizacion(token))
      .send({ idProducto: producto.idProducto, cantidad: indice + 1 })
      .expect(200);
  }

  for (const [indice, { usuario, token }] of actores.entries()) {
    const respuesta = await request(app)
      .get('/api/carrito')
      .set('Authorization', autorizacion(token))
      .expect(200);

    assert.equal(respuesta.body.items.length, 1);
    assert.equal(respuesta.body.items[0].cantidad, indice + 1);
    assert.equal(
      await ItemCarrito.count({ where: { idUsuario: usuario.idUsuario } }),
      1,
    );
  }
});

test('la importación asigna el carrito anónimo solo si el carrito de la cuenta está vacío', async () => {
  const usuario = await crearUsuarioDePrueba();
  const productoAnonimo = await crearProductoDePrueba({ nombre: 'Producto anónimo' });
  const productoCuenta = await crearProductoDePrueba({ nombre: 'Producto de la cuenta' });
  const autorizacionUsuario = autorizacion(tokenCliente(usuario.idCliente, usuario.idUsuario));

  const importado = await request(app)
    .put('/api/carrito/importar')
    .set('Authorization', autorizacionUsuario)
    .send({ items: [{ idProducto: productoAnonimo.idProducto, cantidad: 2 }] })
    .expect(200);

  assert.equal(importado.body.importado, true);
  assert.deepEqual(
    importado.body.items.map((item) => [item.producto.idProducto, item.cantidad]),
    [[productoAnonimo.idProducto, 2]],
  );

  const intentoDeSobrescribir = await request(app)
    .put('/api/carrito/importar')
    .set('Authorization', autorizacionUsuario)
    .send({ items: [{ idProducto: productoCuenta.idProducto, cantidad: 5 }] })
    .expect(200);

  assert.equal(intentoDeSobrescribir.body.importado, false);
  assert.deepEqual(
    intentoDeSobrescribir.body.items.map((item) => item.producto.idProducto),
    [productoAnonimo.idProducto],
  );
});

test('rechaza cantidades inválidas y productos inexistentes sin guardar líneas', async () => {
  const usuario = await crearUsuarioDePrueba();
  const autorizacionUsuario = autorizacion(tokenCliente(usuario.idCliente, usuario.idUsuario));

  await request(app)
    .post('/api/carrito/items')
    .set('Authorization', autorizacionUsuario)
    .send({ idProducto: 999999, cantidad: 1 })
    .expect(400);

  await request(app)
    .post('/api/carrito/items')
    .set('Authorization', autorizacionUsuario)
    .send({ idProducto: 1, cantidad: 0 })
    .expect(400);

  await request(app)
    .put('/api/carrito/importar')
    .set('Authorization', autorizacionUsuario)
    .send({ items: [{ idProducto: 1, cantidad: 1 }, { idProducto: 1, cantidad: 2 }] })
    .expect(400);

  assert.equal(await ItemCarrito.count({ where: { idUsuario: usuario.idUsuario } }), 0);
});
