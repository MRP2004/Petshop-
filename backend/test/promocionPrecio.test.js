import { test } from 'node:test';
import assert from 'node:assert/strict';
import PromocionProducto from '../src/models/promocionProducto.model.js';
import obtenerPrecioVigente from '../src/services/precios/proveedorPrecioConPromocion.service.js';
import obtenerFechaArgentina from '../src/utils/fechaArgentina.js';

const producto = { idProducto: 12, nombre: 'Alimento', precio: '10.00' };

test('convierte el instante UTC al día calendario argentino', () => {
  assert.equal(
    obtenerFechaArgentina(new Date('2026-10-02T02:00:00.000Z')),
    '2026-10-01',
  );
  assert.equal(
    obtenerFechaArgentina(new Date('2026-10-02T04:00:00.000Z')),
    '2026-10-02',
  );
});

test('sin promoción vigente usa el precio de lista', async (t) => {
  t.mock.method(PromocionProducto, 'findAll', async () => []);

  const precio = await obtenerPrecioVigente(producto, {
    instanteEvaluacion: new Date('2026-10-02T12:00:00.000Z'),
  });

  assert.deepEqual(precio, {
    precioListaCentavos: 1000,
    idPromocionProducto: null,
    porcentajeDescuento: 0,
    montoDescuentoCentavos: 0,
    precioFinalCentavos: 1000,
  });
});

test('aplica porcentaje y redondea un medio centavo hacia arriba', async (t) => {
  t.mock.method(PromocionProducto, 'findAll', async () => [
    { idPromocionProducto: 4, descuento: '50.00' },
  ]);

  const precio = await obtenerPrecioVigente({ ...producto, precio: '10.01' }, {
    instanteEvaluacion: new Date('2026-10-02T12:00:00.000Z'),
  });

  assert.deepEqual(precio, {
    precioListaCentavos: 1001,
    idPromocionProducto: 4,
    porcentajeDescuento: 50,
    montoDescuentoCentavos: 501,
    precioFinalCentavos: 500,
  });
});

test('un descuento del 100% deja el precio final en cero', async (t) => {
  t.mock.method(PromocionProducto, 'findAll', async () => [
    { idPromocionProducto: 5, descuento: '100.00' },
  ]);

  const precio = await obtenerPrecioVigente(producto, {
    instanteEvaluacion: new Date('2026-10-02T12:00:00.000Z'),
  });

  assert.equal(precio.precioFinalCentavos, 0);
  assert.equal(precio.montoDescuentoCentavos, 1000);
});

test('falla explícitamente si hay datos con más de una promoción vigente', async (t) => {
  t.mock.method(PromocionProducto, 'findAll', async () => [
    { idPromocionProducto: 4, descuento: '10.00' },
    { idPromocionProducto: 5, descuento: '20.00' },
  ]);

  await assert.rejects(
    () => obtenerPrecioVigente(producto, { instanteEvaluacion: new Date() }),
    (error) =>
      error.statusCode === 500 &&
      error.message === 'El producto Alimento tiene más de una promoción vigente',
  );
});
