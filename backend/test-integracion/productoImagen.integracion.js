// Pruebas de integración real contra MySQL para "producto e imagen como
// una operación atómica" (ver producto.service.js). Requieren una base de
// pruebas ya preparada (ver docs/backend-base-de-datos.md) y NO se
// ejecutan con `npm test`.
//
// A diferencia de test/productoImagenAtomico.test.js (persistencia
// simulada: prueba que el código pasa la misma transacción a cada
// escritura), esto demuestra el rollback real: una fila que de verdad
// queda en la base tras un fallo a mitad de camino, no una suposición
// sobre cómo se comportaría MySQL.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { ForeignKeyConstraintError } from 'sequelize';

import sequelize from '../src/config/database.js';
import Producto from '../src/models/producto.model.js';
import ImagenProducto from '../src/models/imagenProducto.model.js';
import {
  crearProducto,
  actualizarProducto,
  eliminarProducto,
} from '../src/services/producto.service.js';
import { registrarVenta } from '../src/services/venta.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearMedioPagoDePrueba,
  crearProductoDePrueba,
} from './ayudaIntegracion.js';

let cliente;
let medioPago;

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  cliente = await crearClienteDePrueba();
  medioPago = await crearMedioPagoDePrueba();
});

after(async () => {
  await sequelize.close();
});

test('alta completa: producto e imagen quedan persistidos como filas reales relacionadas', async () => {
  const producto = await crearProducto({
    nombre: 'Alimento con imagen',
    precio: '199.90',
    stockActual: 5,
    stockMinimo: 1,
    urlImagen: 'https://proveedor.example.com/fotos/alimento.jpg',
  });

  assert.equal(producto.imagen.url, 'https://proveedor.example.com/fotos/alimento.jpg');

  const imagenEnBase = await ImagenProducto.findByPk(producto.idProducto);
  assert.ok(imagenEnBase, 'la fila de imagenproducto debía existir de verdad en la base');
  assert.equal(imagenEnBase.url, 'https://proveedor.example.com/fotos/alimento.jpg');
});

test('actualizar reemplaza la URL de la imagen ya persistida (no duplica la fila)', async () => {
  const producto = await crearProducto({
    nombre: 'Alimento con imagen',
    precio: '199.90',
    stockActual: 5,
    stockMinimo: 1,
    urlImagen: 'https://proveedor.example.com/fotos/vieja.jpg',
  });

  await actualizarProducto(producto.idProducto, {
    nombre: 'Alimento con imagen',
    precio: '199.90',
    stockMinimo: 1,
    urlImagen: 'https://proveedor.example.com/fotos/nueva.jpg',
  });

  const filas = await ImagenProducto.findAll({ where: { idProducto: producto.idProducto } });
  assert.equal(filas.length, 1, 'no debía quedar más de una fila de imagen para el mismo producto');
  assert.equal(filas[0].url, 'https://proveedor.example.com/fotos/nueva.jpg');
});

test('borrado permitido: producto e imagen se eliminan juntos cuando no hay ventas asociadas', async () => {
  const producto = await crearProducto({
    nombre: 'Alimento sin ventas',
    precio: '50.00',
    stockActual: 5,
    stockMinimo: 1,
    urlImagen: 'https://proveedor.example.com/fotos/alimento.jpg',
  });

  await eliminarProducto(producto.idProducto);

  assert.equal(await Producto.findByPk(producto.idProducto), null);
  assert.equal(await ImagenProducto.findByPk(producto.idProducto), null);
});

test('rollback real: borrado bloqueado por una venta asociada NO deja el producto sin su imagen', async () => {
  // Reproduce contra MySQL real el caso que motivó esta corrección: se
  // encontró con persistencia simulada que ImagenProducto.destroy podía
  // "tener éxito" y producto.destroy fallar después (relación con ventas),
  // dejando el producto vivo pero sin imagen. Acá el bloqueo es real: el
  // producto tiene una venta real asociada (detalleventa.idProducto, FK sin
  // acción en cascada), así que producto.destroy() debe fallar de verdad.
  const producto = await crearProducto({
    nombre: 'Alimento con venta asociada',
    precio: '80.00',
    stockActual: 10,
    stockMinimo: 1,
    urlImagen: 'https://proveedor.example.com/fotos/alimento.jpg',
  });

  await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 1 }],
  });

  await assert.rejects(
    () => eliminarProducto(producto.idProducto),
    (error) => error instanceof ForeignKeyConstraintError,
  );

  // Si la corrección no estuviera (cada escritura en su propia
  // "transacción" implícita, sin una real que las una), acá se vería el
  // bug original: el producto existiría, pero sin su fila de imagen. Con
  // todo dentro de una única sequelize.transaction, el rollback deshace
  // TAMBIÉN el ImagenProducto.destroy que ya se había ejecutado.
  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.ok(productoFinal, 'el producto debía seguir existiendo (el borrado se rechazó)');

  const imagenFinal = await ImagenProducto.findByPk(producto.idProducto);
  assert.ok(
    imagenFinal,
    'la imagen NO debía haberse perdido: el rollback debía revertir también su borrado',
  );
  assert.equal(imagenFinal.url, 'https://proveedor.example.com/fotos/alimento.jpg');
});
