// Corrección de una revisión posterior: se reprodujo con persistencia
// simulada que ImagenProducto.destroy podía tener éxito y producto.destroy
// fallar después (relación con ventas), dejando el producto vivo pero sin
// imagen — una mezcla que nunca debería poder observarse. La corrección
// (producto.service.js) hace correr crear/actualizar/eliminar producto
// dentro de una única sequelize.transaction, pasando esa misma transacción
// a cada consulta/escritura relacionada.
//
// Lo que estas pruebas demuestran, con stubs (sin MySQL real):
//   1. Cada operación de escritura de una misma llamada recibe el MISMO
//      objeto de transacción — la prueba estructural de que participan de
//      una sola transacción real cuando corran contra MySQL de verdad.
//   2. Si cualquier paso de la operación falla, el error se propaga fuera
//      de la función del servicio sin que nada lo trague — la señal que
//      hace que sequelize.transaction() revierta todo lo anterior en una
//      base real.
//
// Lo que estas pruebas NO demuestran (no pueden, sin una base real): que
// una fila efectivamente desaparece de la tabla tras el rollback. Esa
// prueba, con persistencia real, vive en
// test-integracion/productoImagen.integracion.js (contra petshop_test).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import Producto from '../src/models/producto.model.js';
import ImagenProducto from '../src/models/imagenProducto.model.js';
import Favorito from '../src/models/favorito.model.js';
import { tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

const originales = {};

let transaccionActual;
let llamadasConTransaccion; // [{ metodo, transaccionRecibida }]
let productoDestroyDebeFallar;
let imagenDestruida;

const registrarLlamada = (metodo, options) => {
  llamadasConTransaccion.push({ metodo, transaccionRecibida: options?.transaction });
};

const productoFalso = (extra = {}) => ({
  idProducto: 9,
  nombre: 'Producto de prueba',
  precio: '10.00',
  stockMinimo: 1,
  stockActual: 5,
  idProveedor: null,
  idTipoMascota: null,
  idCategoria: null,
  categoria: null,
  tipoMascota: null,
  proveedor: null,
  imagen: null,
  async update(datos, options) {
    registrarLlamada('producto.update', options);
    Object.assign(this, datos);
  },
  async destroy(options) {
    registrarLlamada('producto.destroy', options);
    if (productoDestroyDebeFallar) {
      throw new Error('Simulado: no se puede eliminar, existen ventas asociadas');
    }
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
  originales.favoritoDestroy = Favorito.destroy;

  // Cada llamada a sequelize.transaction usa un objeto de transacción
  // NUEVO y distinguible (no un objeto vacío compartido): así se puede
  // comprobar que todas las operaciones dentro de una misma llamada al
  // servicio reciben exactamente ESE objeto, y no uno de otra operación.
  sequelize.transaction = async (callback) => {
    transaccionActual = { marca: Symbol('transaccion'), LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    return callback(transaccionActual);
  };

  Producto.create = async (datos, options) => {
    registrarLlamada('Producto.create', options);
    return productoFalso({ idProducto: 9, ...datos });
  };

  Producto.findByPk = async (id, options) => {
    registrarLlamada('Producto.findByPk', options);
    return productoFalso();
  };

  ImagenProducto.create = async (datos, options) => {
    registrarLlamada('ImagenProducto.create', options);
    if (datos.url === 'https://falla.example.com/imagen.jpg') {
      throw new Error('Simulado: fallo de base al guardar la imagen');
    }
    return { ...datos };
  };

  ImagenProducto.findByPk = async (idProducto, options) => {
    registrarLlamada('ImagenProducto.findByPk', options);
    return {
      idProducto,
      url: 'https://proveedor.example.com/fotos/vieja.jpg',
      async update(datos, updateOptions) {
        registrarLlamada('ImagenProducto.update', updateOptions);
        if (datos.url === 'https://falla.example.com/imagen.jpg') {
          throw new Error('Simulado: fallo de base al actualizar la imagen');
        }
        Object.assign(this, datos);
      },
    };
  };

  ImagenProducto.destroy = async (options) => {
    registrarLlamada('ImagenProducto.destroy', options);
    imagenDestruida = true;
    return 1;
  };

  // Mismo motivo que ImagenProducto.destroy (ronda 2, Etapa 5: eliminarProducto
  // también borra los favoritos del producto antes de borrarlo, ver
  // producto.service.js): sin este stub, el código real intentaría una
  // consulta real contra la base con la transacción falsa de arriba.
  Favorito.destroy = async (options) => {
    registrarLlamada('Favorito.destroy', options);
    return 0;
  };
});

beforeEach(() => {
  llamadasConTransaccion = [];
  productoDestroyDebeFallar = false;
  imagenDestruida = false;
});

after(() => {
  sequelize.transaction = originales.sequelizeTransaction;
  Producto.create = originales.productoCreate;
  Producto.findByPk = originales.productoFindByPk;
  ImagenProducto.create = originales.imagenCreate;
  ImagenProducto.findByPk = originales.imagenFindByPk;
  ImagenProducto.destroy = originales.imagenDestroy;
  Favorito.destroy = originales.favoritoDestroy;
});

test('alta completa: producto e imagen se crean con la misma transacción', async () => {
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

  assert.equal(respuesta.body.idProducto, 9);

  const creaciones = llamadasConTransaccion.filter(
    (l) => l.metodo === 'Producto.create' || l.metodo === 'ImagenProducto.create',
  );
  assert.equal(creaciones.length, 2, 'debían registrarse ambas creaciones');
  assert.equal(
    creaciones[0].transaccionRecibida,
    creaciones[1].transaccionRecibida,
    'producto e imagen debían crearse con el mismo objeto de transacción',
  );
  assert.ok(creaciones[0].transaccionRecibida, 'la transacción no puede ser undefined');
});

test('fallo al guardar la imagen: el error se propaga (en una base real, esto revierte también el producto ya creado)', async () => {
  const respuesta = await request(app)
    .post('/api/productos')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium',
      precio: 10,
      stockActual: 5,
      stockMinimo: 1,
      urlImagen: 'https://falla.example.com/imagen.jpg',
    });

  // No debe presentarse como éxito (201) cuando la imagen no se pudo
  // guardar: el error de ImagenProducto.create debe llegar hasta la
  // respuesta HTTP sin que nada lo trague en el camino.
  assert.equal(respuesta.status, 500);

  const creacionProducto = llamadasConTransaccion.find((l) => l.metodo === 'Producto.create');
  const creacionImagen = llamadasConTransaccion.find((l) => l.metodo === 'ImagenProducto.create');
  assert.ok(creacionProducto, 'Producto.create sí debía haberse intentado');
  assert.ok(creacionImagen, 'ImagenProducto.create sí debía haberse intentado');
  assert.equal(
    creacionProducto.transaccionRecibida,
    creacionImagen.transaccionRecibida,
    'ambas escrituras debían compartir la misma transacción para poder revertirse juntas',
  );
});

test('fallo al actualizar la imagen: el error se propaga (en una base real, esto revierte también la edición del producto)', async () => {
  const respuesta = await request(app)
    .put('/api/productos/9')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      nombre: 'Alimento premium editado',
      precio: 12,
      stockMinimo: 1,
      urlImagen: 'https://falla.example.com/imagen.jpg',
    });

  assert.equal(respuesta.status, 500);

  const actualizacionProducto = llamadasConTransaccion.find((l) => l.metodo === 'producto.update');
  const actualizacionImagen = llamadasConTransaccion.find((l) => l.metodo === 'ImagenProducto.update');
  assert.ok(actualizacionProducto, 'producto.update sí debía haberse intentado');
  assert.ok(actualizacionImagen, 'ImagenProducto.update sí debía haberse intentado');
  assert.equal(
    actualizacionProducto.transaccionRecibida,
    actualizacionImagen.transaccionRecibida,
    'ambas escrituras debían compartir la misma transacción',
  );
});

test('borrado permitido: producto e imagen se eliminan con la misma transacción', async () => {
  await request(app)
    .delete('/api/productos/9')
    .set('Authorization', autorizacion(tokenVendedor()))
    .expect(204);

  assert.equal(imagenDestruida, true);

  const borradoImagen = llamadasConTransaccion.find((l) => l.metodo === 'ImagenProducto.destroy');
  const borradoFavorito = llamadasConTransaccion.find((l) => l.metodo === 'Favorito.destroy');
  const borradoProducto = llamadasConTransaccion.find((l) => l.metodo === 'producto.destroy');
  assert.ok(borradoImagen);
  assert.ok(borradoFavorito);
  assert.ok(borradoProducto);
  assert.equal(borradoImagen.transaccionRecibida, borradoProducto.transaccionRecibida);
  assert.equal(borradoFavorito.transaccionRecibida, borradoProducto.transaccionRecibida);
});

test('borrado bloqueado por ventas: producto.destroy falla y el error se propaga sin presentarse como éxito', async () => {
  productoDestroyDebeFallar = true;

  const respuesta = await request(app)
    .delete('/api/productos/9')
    .set('Authorization', autorizacion(tokenVendedor()));

  // El caso reproducido originalmente: ImagenProducto.destroy "tuvo éxito"
  // (se registró la llamada) pero producto.destroy falló después. Lo que
  // importa es que la respuesta HTTP NUNCA sea un 204 de éxito en ese caso
  // — si lo fuera, la interfaz le diría a quien usa el panel que el
  // producto se borró cuando en realidad sigue existiendo (con o sin
  // imagen). Con ambas escrituras en la misma transacción, una base real
  // revertiría también el ImagenProducto.destroy ya "exitoso".
  assert.notEqual(respuesta.status, 204);

  const borradoImagen = llamadasConTransaccion.find((l) => l.metodo === 'ImagenProducto.destroy');
  const borradoFavorito = llamadasConTransaccion.find((l) => l.metodo === 'Favorito.destroy');
  const borradoProducto = llamadasConTransaccion.find((l) => l.metodo === 'producto.destroy');
  assert.ok(borradoImagen, 'ImagenProducto.destroy sí se había intentado (y "tenido éxito" en el stub)');
  assert.ok(borradoFavorito, 'Favorito.destroy sí se había intentado (y "tenido éxito" en el stub)');
  assert.ok(borradoProducto, 'producto.destroy sí se había intentado (y fallado)');
  assert.equal(
    borradoImagen.transaccionRecibida,
    borradoProducto.transaccionRecibida,
    'ambos borrados debían compartir la misma transacción para que el rollback deshaga los dos juntos',
  );
  assert.equal(
    borradoFavorito.transaccionRecibida,
    borradoProducto.transaccionRecibida,
    'los tres borrados debían compartir la misma transacción para que el rollback deshaga todo junto',
  );
});
