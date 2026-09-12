// Pruebas de integración real contra MySQL para el movimiento de stock
// (Corte C) y su interacción con ventas concurrentes, más la separación del
// PUT general de producto. No se ejecutan con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/database.js';
import Producto from '../src/models/producto.model.js';
import {
  actualizarProducto,
  ajustarStockProducto,
} from '../src/services/producto.service.js';
import { registrarVenta } from '../src/services/venta.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearMedioPagoDePrueba,
  crearProductoDePrueba,
  retenerBloqueoDeFila,
  esperarContencionSobre,
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

test('ajustarStockProducto con una cantidad positiva suma al stock actual (entrada de mercadería)', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const actualizado = await ajustarStockProducto(producto.idProducto, {
    cantidad: 15,
  });

  assert.equal(actualizado.stockActual, 25);
});

test('ajustarStockProducto con una cantidad negativa resta del stock actual (ajuste/corrección)', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const actualizado = await ajustarStockProducto(producto.idProducto, {
    cantidad: -4,
  });

  assert.equal(actualizado.stockActual, 6);
});

test('ajustarStockProducto rechaza un movimiento que dejaría el stock negativo, sin modificar nada', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 3 });

  await assert.rejects(
    () => ajustarStockProducto(producto.idProducto, { cantidad: -10 }),
    (error) => error.statusCode === 409,
  );

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 3);
});

test('PUT de producto (actualizarProducto) rechaza stockActual en el cuerpo y no modifica el stock', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  await assert.rejects(
    () =>
      actualizarProducto(producto.idProducto, {
        nombre: 'Nombre editado',
        precio: '55.00',
        stockMinimo: 2,
        stockActual: 999, // intento de sobrescribir el stock por esta vía
      }),
    (error) =>
      error.statusCode === 400 &&
      error.message ===
        'El stock no se modifica por esta vía: use PATCH /api/productos/:id/stock',
  );

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10, 'el stock no debía cambiar');
  assert.equal(productoFinal.nombre, 'Producto de prueba', 'tampoco debía aplicarse el resto del cuerpo');
});

test('PUT de producto sin stockActual actualiza los demás campos sin tocar el stock', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  const actualizado = await actualizarProducto(producto.idProducto, {
    nombre: 'Nombre editado',
    precio: '55.00',
    stockMinimo: 2,
  });

  assert.equal(actualizado.nombre, 'Nombre editado');
  assert.equal(actualizado.precio, '55.00');
  assert.equal(actualizado.stockMinimo, 2);
  assert.equal(actualizado.stockActual, 10, 'el stock debe permanecer intacto');
});

test('concurrencia real (contención confirmada): un ajuste de stock y una venta simultáneos sobre el mismo producto no pierden cambios', async () => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });

  // Se retiene el mismo bloqueo (LOCK.UPDATE sobre Producto) que tanto
  // registrarVenta como ajustarStockProducto necesitan tomar, y se confirma
  // contra performance_schema que ambas quedaron efectivamente esperando
  // antes de liberarlo: no se asume que "lanzarlas juntas" alcanza para
  // que compitan de verdad.
  const { idConexion, liberar } = await retenerBloqueoDeFila(
    'producto',
    'idProducto',
    producto.idProducto,
  );

  let resultadoVenta;
  let resultadoAjuste;

  try {
    const promesaVenta = registrarVenta({
      idCliente: cliente.idCliente,
      idMedioPago: medioPago.idMedioPago,
      detalles: [{ idProducto: producto.idProducto, cantidad: 3 }],
    });
    const promesaAjuste = ajustarStockProducto(producto.idProducto, {
      cantidad: 5,
    });

    const huboContencion = await esperarContencionSobre(idConexion, {
      timeoutMs: 3000,
    });
    assert.equal(
      huboContencion,
      true,
      'no se detectó contención real entre la venta y el ajuste de stock',
    );

    await liberar();

    [resultadoVenta, resultadoAjuste] = await Promise.allSettled([
      promesaVenta,
      promesaAjuste,
    ]);
  } finally {
    await liberar();
  }

  assert.equal(resultadoVenta.status, 'fulfilled');
  assert.equal(resultadoAjuste.status, 'fulfilled');

  const productoFinal = await Producto.findByPk(producto.idProducto);
  // 10 - 3 (venta) + 5 (ajuste) = 12, sin importar cuál de las dos haya
  // aplicado primero: si alguna hubiera leído un stock desactualizado
  // (pérdida de actualización), el resultado no daría 12.
  assert.equal(productoFinal.stockActual, 12);
});
