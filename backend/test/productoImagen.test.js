// Corrección de esta etapa (imágenes de producto, ver
// docs/frontend-diseno.md): antes, el catálogo solo podía mostrar un ícono
// por categoría, sin ninguna forma de cargar una imagen real por producto.
// Se agregó una tabla nueva relacionada (`imagenproducto`, 1 a 1 opcional
// con `producto` — mismo criterio que direccionEntrega con venta, ver
// docs/backend-base-de-datos.md), en vez de una columna agregada a
// `producto`, para no requerir ninguna migración sobre la base de
// desarrollo.
//
// Igual que ventaDescuentoAutorizacion.test.js: sin una base de pruebas de
// MySQL disponible, se simula la persistencia con stubs de los métodos de
// los modelos usados por producto.service.js. Los stubs solo devuelven
// datos falsos controlados por la propia prueba: no golpean la base ni
// corren SQL.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import Producto from '../src/models/producto.model.js';
import ImagenProducto from '../src/models/imagenProducto.model.js';
import { tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

const originales = {};

let productoCreado;
let imagenAlmacenada; // null = sin fila; objeto = { idProducto, url }

const productoFalso = (extra = {}) => ({
  idProducto: 9,
  nombre: 'Producto de prueba',
  descripcion: null,
  precio: '10.00',
  stockMinimo: 1,
  stockActual: 5,
  idProveedor: null,
  idTipoMascota: null,
  idCategoria: null,
  categoria: null,
  tipoMascota: null,
  proveedor: null,
  imagen: imagenAlmacenada,
  async update(datos) {
    Object.assign(this, datos);
  },
  ...extra,
});

before(() => {
  originales.sequelizeTransaction = sequelize.transaction;
  originales.productoCreate = Producto.create;
  originales.productoFindByPk = Producto.findByPk;
  originales.imagenCreate = ImagenProducto.create;
  originales.imagenFindByPk = ImagenProducto.findByPk;
  originales.imagenDestroy = ImagenProducto.destroy;

  // Corrección de esta etapa: crearProducto/actualizarProducto ahora corren
  // dentro de sequelize.transaction (ver "producto e imagen como una
  // operación atómica" en producto.service.js). Este stub solo ejecuta el
  // callback con un objeto de transacción falso — no simula rollback,
  // porque estas pruebas son todas de camino feliz; el rollback ante fallas
  // se prueba en productoImagenAtomico.test.js.
  sequelize.transaction = async (callback) => callback({});

  Producto.create = async (datos) => {
    productoCreado = { idProducto: 9, ...datos };
    return productoCreado;
  };

  // obtenerProductoPorId (llamado al final de crear/actualizar) vuelve a
  // leer el producto con su relación `imagen`: se devuelve el estado actual
  // de `imagenAlmacenada`, tal como lo dejó cada operación.
  Producto.findByPk = async () => productoFalso({ imagen: imagenAlmacenada });

  ImagenProducto.create = async (datos) => {
    imagenAlmacenada = { ...datos };
    return imagenAlmacenada;
  };

  ImagenProducto.findByPk = async (idProducto) =>
    imagenAlmacenada && imagenAlmacenada.idProducto === idProducto
      ? { ...imagenAlmacenada, async update(datos) {
          Object.assign(imagenAlmacenada, datos);
          Object.assign(this, datos);
        } }
      : null;

  ImagenProducto.destroy = async () => {
    imagenAlmacenada = null;
    return 1;
  };
});

beforeEach(() => {
  productoCreado = undefined;
  imagenAlmacenada = null;
});

after(() => {
  sequelize.transaction = originales.sequelizeTransaction;
  Producto.create = originales.productoCreate;
  Producto.findByPk = originales.productoFindByPk;
  ImagenProducto.create = originales.imagenCreate;
  ImagenProducto.findByPk = originales.imagenFindByPk;
  ImagenProducto.destroy = originales.imagenDestroy;
});

test('POST /api/productos con urlImagen http válida crea la fila de imagen asociada', async () => {
  const respuesta = await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockActual: 5,
      stockMinimo: 1,
      urlImagen: 'https://proveedor.example.com/fotos/alimento.jpg',
    })
    .expect(201);

  assert.equal(imagenAlmacenada.idProducto, 9);
  assert.equal(imagenAlmacenada.url, 'https://proveedor.example.com/fotos/alimento.jpg');
  assert.equal(respuesta.body.imagen.url, 'https://proveedor.example.com/fotos/alimento.jpg');
});

test('POST /api/productos sin urlImagen no crea ninguna fila de imagen', async () => {
  await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({ nombre: 'Juguete simple', precio: 10, stockActual: 5, stockMinimo: 1 })
    .expect(201);

  assert.equal(imagenAlmacenada, null);
});

test('POST /api/productos con urlImagen sin http/https responde 400 y no crea el producto', async () => {
  const respuesta = await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockActual: 5,
      stockMinimo: 1,
      urlImagen: 'ftp://no-es-http/imagen.jpg',
    })
    .expect(400);

  assert.equal(
    respuesta.body.error,
    'La URL de la imagen debe empezar con http:// o https://',
  );
  assert.equal(imagenAlmacenada, null);
});

test('POST /api/productos con urlImagen demasiado larga responde 400', async () => {
  const urlLarga = `https://ejemplo.com/${'a'.repeat(300)}.jpg`;

  const respuesta = await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockActual: 5,
      stockMinimo: 1,
      urlImagen: urlLarga,
    })
    .expect(400);

  assert.match(respuesta.body.error, /no puede superar los 300 caracteres/);
});

test('PUT /api/productos/:id agrega una imagen a un producto que no tenía', async () => {
  const respuesta = await request(app)
    .put('/api/productos/9')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockMinimo: 1,
      urlImagen: 'https://proveedor.example.com/fotos/nueva.jpg',
    })
    .expect(200);

  assert.equal(imagenAlmacenada.url, 'https://proveedor.example.com/fotos/nueva.jpg');
  assert.equal(respuesta.body.imagen.url, 'https://proveedor.example.com/fotos/nueva.jpg');
});

test('PUT /api/productos/:id reemplaza la URL de una imagen ya cargada (no duplica la fila)', async () => {
  imagenAlmacenada = { idProducto: 9, url: 'https://proveedor.example.com/fotos/vieja.jpg' };

  await request(app)
    .put('/api/productos/9')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockMinimo: 1,
      urlImagen: 'https://proveedor.example.com/fotos/actualizada.jpg',
    })
    .expect(200);

  assert.equal(imagenAlmacenada.url, 'https://proveedor.example.com/fotos/actualizada.jpg');
});

test('PUT /api/productos/:id con urlImagen vacía borra la imagen ya cargada', async () => {
  imagenAlmacenada = { idProducto: 9, url: 'https://proveedor.example.com/fotos/vieja.jpg' };

  const respuesta = await request(app)
    .put('/api/productos/9')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockMinimo: 1,
      urlImagen: '',
    })
    .expect(200);

  assert.equal(imagenAlmacenada, null);
  assert.equal(respuesta.body.imagen, null);
});
