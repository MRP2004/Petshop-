// Pruebas de integración real contra MySQL para los CRUD existentes:
// relaciones inexistentes, comportamiento real de borrado (clave foránea) y
// un recorrido CRUD completo para confirmar que las capas están bien
// conectadas contra una base real. No se ejecutan con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { ForeignKeyConstraintError } from 'sequelize';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import Producto from '../src/models/producto.model.js';
import Cliente from '../src/models/cliente.model.js';
import Venta from '../src/models/venta.model.js';
import {
  crearCliente,
  obtenerClientePorId,
  actualizarCliente,
  eliminarCliente,
} from '../src/services/cliente.service.js';
import { crearProducto } from '../src/services/producto.service.js';
import { crearCategoria, eliminarCategoria } from '../src/services/categoria.service.js';
import { registrarVenta } from '../src/services/venta.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearMedioPagoDePrueba,
  crearProductoDePrueba,
} from './ayudaIntegracion.js';
import { tokenVendedor, autorizacion } from '../test/ayudaAutenticacion.js';

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
});

after(async () => {
  await sequelize.close();
});

test('crear un producto con una categoría inexistente responde 400, sin crear el producto', async () => {
  await assert.rejects(
    () =>
      crearProducto({
        nombre: 'Producto con categoría inexistente',
        precio: '10.00',
        stockActual: 5,
        stockMinimo: 1,
        idCategoria: 999999,
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message === 'La categoría indicada no existe',
  );

  const cantidad = await Producto.count();
  assert.equal(cantidad, 0);
});

test('recorrido CRUD completo de Cliente contra MySQL real', async () => {
  const creado = await crearCliente({
    nombre: 'Ana',
    apellido: 'Pérez',
    telefono: '3410000000',
    email: 'ana@example.com',
    direccion: 'Calle Falsa 123',
  });

  assert.ok(creado.idCliente > 0);

  const leido = await obtenerClientePorId(creado.idCliente);
  assert.equal(leido.nombre, 'Ana');

  const actualizado = await actualizarCliente(creado.idCliente, {
    nombre: 'Ana María',
    apellido: 'Pérez',
    telefono: null,
    email: null,
    direccion: null,
  });
  assert.equal(actualizado.nombre, 'Ana María');

  await eliminarCliente(creado.idCliente);

  await assert.rejects(
    () => obtenerClientePorId(creado.idCliente),
    (error) => error.statusCode === 404,
  );
});

test('capa de servicio: eliminarCliente propaga el error de persistencia real (ForeignKeyConstraintError), no un AppError con statusCode', async () => {
  // eliminarCliente no atrapa ni traduce este error: eso es responsabilidad
  // de error.middleware.js, una capa más arriba (ver el siguiente test,
  // "capa HTTP"). Comprobar acá error.statusCode === 409 sería exigirle a
  // esta capa un comportamiento que no le corresponde.
  const cliente = await crearClienteDePrueba();
  const medioPago = await crearMedioPagoDePrueba();
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 1 }],
  });

  await assert.rejects(
    () => eliminarCliente(cliente.idCliente),
    (error) => error instanceof ForeignKeyConstraintError,
  );

  const clienteFinal = await Cliente.findByPk(cliente.idCliente);
  assert.ok(clienteFinal, 'el cliente debía seguir existiendo');

  const cantidadVentas = await Venta.count({
    where: { idCliente: cliente.idCliente },
  });
  assert.equal(cantidadVentas, 1, 'la venta debía seguir existiendo (historial preservado)');
});

test('capa HTTP: DELETE /api/clientes/:id con ventas asociadas responde 409, y el cliente y su venta siguen existiendo', async () => {
  const cliente = await crearClienteDePrueba();
  const medioPago = await crearMedioPagoDePrueba();
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 1 }],
  });

  const respuesta = await request(app)
    .delete(`/api/clientes/${cliente.idCliente}`)
    .set('Authorization', autorizacion(tokenVendedor()))
    .expect(409);

  assert.equal(
    respuesta.body.error,
    'No se puede completar la operación porque el registro está siendo utilizado',
  );

  const clienteFinal = await Cliente.findByPk(cliente.idCliente);
  assert.ok(clienteFinal, 'el cliente debía seguir existiendo');

  const ventaFinal = await Venta.findByPk(venta.idVenta);
  assert.ok(ventaFinal, 'la venta debía seguir existiendo');
});

test('comportamiento real de la FK opcional Producto.idCategoria al borrar la categoría', async () => {
  // Según la asociación declarada (Producto.belongsTo(Categoria), FK
  // opcional: allowNull:true) y el orden en que Sequelize resuelve
  // belongsTo antes que hasMany (ver auditoría), lo esperado es onDelete:
  // 'SET NULL'. Esta prueba lo confirma contra el esquema efectivo, en vez
  // de asumirlo.
  const categoria = await crearCategoria({ nombre: 'Alimentos', descripcion: null });
  const producto = await crearProducto({
    nombre: 'Producto con categoría',
    precio: '10.00',
    stockActual: 5,
    stockMinimo: 1,
    idCategoria: categoria.idCategoria,
  });

  await eliminarCategoria(categoria.idCategoria);

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(
    productoActualizado.idCategoria,
    null,
    'se esperaba que la FK opcional aplicara SET NULL; si esto falla, el ' +
      'comportamiento real difiere de lo documentado y hay que actualizar ' +
      'docs/backend-base-de-datos.md',
  );
});
