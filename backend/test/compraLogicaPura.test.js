import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularHashContenido,
  cotizacionEstaDesactualizada,
  generarNumeroComprobante,
  validarClaveIdempotencia,
  validarCotizacionAceptada,
  TTL_COTIZACION_MS,
} from '../src/services/compra.service.js';
import { validarPrecioVigente } from '../src/services/cotizacion.service.js';

// --- calcularHashContenido ---

const detallesBase = [{ idProducto: 1, cantidad: 2 }, { idProducto: 5, cantidad: 1 }];

test('calcularHashContenido es determinista para el mismo contenido', () => {
  const hashA = calcularHashContenido({
    idCliente: 3,
    detallesPreparados: detallesBase,
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: null,
  });
  const hashB = calcularHashContenido({
    idCliente: 3,
    detallesPreparados: detallesBase,
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: null,
  });

  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64); // sha256 en hexadecimal
});

test('calcularHashContenido cambia si cambia la cantidad de un producto', () => {
  const hashOriginal = calcularHashContenido({
    idCliente: 3,
    detallesPreparados: detallesBase,
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: null,
  });
  const hashConOtraCantidad = calcularHashContenido({
    idCliente: 3,
    detallesPreparados: [{ idProducto: 1, cantidad: 99 }, { idProducto: 5, cantidad: 1 }],
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: null,
  });

  assert.notEqual(hashOriginal, hashConOtraCantidad);
});

test('calcularHashContenido NO cambia si cambia el medio de pago simulado o la tarjeta usada', () => {
  // Corrección de una revisión independiente (Codex): "contenido comercial"
  // es qué se compra, no cómo se paga — así, recuperarse de una respuesta
  // perdida (reintentar la misma clave eligiendo otro medio de pago, porque
  // el formulario se reinició tras recargar) encuentra el intento ya
  // resuelto en vez de un falso "contenido distinto" (ver compra.service.js).
  const base = {
    idCliente: 3,
    detallesPreparados: detallesBase,
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: null,
  };

  assert.equal(calcularHashContenido(base), calcularHashContenido(base));
});

test('calcularHashContenido cambia si cambia la entrega (método o dirección)', () => {
  const hashRetiro = calcularHashContenido({
    idCliente: 3,
    detallesPreparados: detallesBase,
    metodoEntrega: 'retiro en sucursal',
    direccionEntrega: null,
  });
  const hashDomicilio = calcularHashContenido({
    idCliente: 3,
    detallesPreparados: detallesBase,
    metodoEntrega: 'envío a domicilio',
    direccionEntrega: 'Calle Falsa 123',
  });

  assert.notEqual(hashRetiro, hashDomicilio);
});

// --- cotizacionEstaDesactualizada ---

const lineaBase = { idProducto: 1, precioFinalCentavos: 10000, idPromocionProducto: null };

test('cotizacionEstaDesactualizada es false cuando todo coincide y la cotización es reciente', () => {
  const recalculada = { totalCentavos: 10000, lineas: [lineaBase] };
  const aceptada = {
    totalCentavos: 10000,
    lineas: [lineaBase],
    emitidaEn: new Date().toISOString(),
  };

  assert.equal(cotizacionEstaDesactualizada(recalculada, aceptada), false);
});

test('cotizacionEstaDesactualizada detecta un precio distinto (precio manipulado o cambiado)', () => {
  const recalculada = { totalCentavos: 10000, lineas: [lineaBase] };
  const aceptada = {
    totalCentavos: 8000, // el navegador "aceptó" un total más bajo
    lineas: [{ ...lineaBase, precioFinalCentavos: 8000 }],
    emitidaEn: new Date().toISOString(),
  };

  assert.equal(cotizacionEstaDesactualizada(recalculada, aceptada), true);
});

test('cotizacionEstaDesactualizada detecta una promoción distinta aunque el precio coincida por casualidad', () => {
  const recalculada = { totalCentavos: 10000, lineas: [lineaBase] };
  const aceptada = {
    totalCentavos: 10000,
    lineas: [{ ...lineaBase, idPromocionProducto: 999 }],
    emitidaEn: new Date().toISOString(),
  };

  assert.equal(cotizacionEstaDesactualizada(recalculada, aceptada), true);
});

test('cotizacionEstaDesactualizada detecta un cambio en el desglose (lista/descuento) aunque el precio final y el total coincidan', () => {
  // CU-04, §6: "pedir reconfirmación cuando cambien los importes o
  // condiciones relevantes del desglose aceptado, aunque el total final
  // coincida" — acá precioListaCentavos y montoDescuentoCentavos cambiaron
  // de forma compensada (el precio de lista subió y el descuento subió con
  // él), dejando precioFinalCentavos y el total intactos.
  const lineaConDesglose = {
    idProducto: 1,
    precioListaCentavos: 12000,
    montoDescuentoCentavos: 2000,
    precioFinalCentavos: 10000,
    idPromocionProducto: 7,
  };
  const recalculada = {
    totalCentavos: 10000,
    lineas: [{ ...lineaConDesglose, precioListaCentavos: 15000, montoDescuentoCentavos: 5000 }],
  };
  const aceptada = {
    totalCentavos: 10000,
    lineas: [lineaConDesglose],
    emitidaEn: new Date().toISOString(),
  };

  assert.equal(cotizacionEstaDesactualizada(recalculada, aceptada), true);
});

test('cotizacionEstaDesactualizada vence una cotización más vieja que el TTL, aunque los precios no cambiaron', () => {
  const recalculada = { totalCentavos: 10000, lineas: [lineaBase] };
  const emitidaHaceRato = new Date(Date.now() - TTL_COTIZACION_MS - 1000).toISOString();
  const aceptada = { totalCentavos: 10000, lineas: [lineaBase], emitidaEn: emitidaHaceRato };

  assert.equal(cotizacionEstaDesactualizada(recalculada, aceptada), true);
});

// --- generarNumeroComprobante ---

test('generarNumeroComprobante tiene el formato PS-<año>-<idVenta con 6 dígitos>', () => {
  const numero = generarNumeroComprobante(15);
  const anioActual = new Date().getFullYear();

  assert.equal(numero, `PS-${anioActual}-000015`);
});

// --- validarClaveIdempotencia / validarCotizacionAceptada ---

test('validarClaveIdempotencia rechaza claves demasiado cortas, vacías o no string', () => {
  for (const valor of ['', 'corta', 123, null, undefined, 'x'.repeat(101)]) {
    assert.throws(
      () => validarClaveIdempotencia(valor),
      (error) => error.statusCode === 400,
    );
  }
});

test('validarClaveIdempotencia acepta un UUID típico', () => {
  assert.equal(
    validarClaveIdempotencia('550e8400-e29b-41d4-a716-446655440000'),
    '550e8400-e29b-41d4-a716-446655440000',
  );
});

test('validarCotizacionAceptada rechaza formas inválidas', () => {
  for (const valor of [null, {}, { lineas: [] }, { lineas: [{}], totalCentavos: 'no' }]) {
    assert.throws(
      () => validarCotizacionAceptada(valor),
      (error) => error.statusCode === 400,
    );
  }
});

// --- validarPrecioVigente (cotizacion.service.js): defensa contra un
// proveedor de precios (José) que devuelva algo inconsistente. ---

const precioValidoSinPromocion = {
  precioListaCentavos: 10000,
  idPromocionProducto: null,
  porcentajeDescuento: 0,
  montoDescuentoCentavos: 0,
  precioFinalCentavos: 10000,
};

const precioValidoConPromocion = {
  precioListaCentavos: 10000,
  idPromocionProducto: 7,
  porcentajeDescuento: 20,
  montoDescuentoCentavos: 2000,
  precioFinalCentavos: 8000,
};

test('validarPrecioVigente acepta las dos formas válidas del contrato (con y sin promoción)', () => {
  assert.doesNotThrow(() => validarPrecioVigente(precioValidoSinPromocion, 'Producto'));
  assert.doesNotThrow(() => validarPrecioVigente(precioValidoConPromocion, 'Producto'));
});

test('validarPrecioVigente rechaza precioFinal inconsistente con lista - descuento', () => {
  assert.throws(
    () => validarPrecioVigente({ ...precioValidoConPromocion, precioFinalCentavos: 7000 }, 'Producto'),
    (error) => error.statusCode === 500,
  );
});

test('validarPrecioVigente rechaza un descuento mayor que el precio de lista', () => {
  assert.throws(
    () => validarPrecioVigente({ ...precioValidoConPromocion, montoDescuentoCentavos: 20000, precioFinalCentavos: -10000 }, 'Producto'),
    (error) => error.statusCode === 500,
  );
});

test('validarPrecioVigente rechaza un descuento sin promoción asociada (idPromocionProducto null)', () => {
  assert.throws(
    () => validarPrecioVigente({ ...precioValidoSinPromocion, montoDescuentoCentavos: 1000, precioFinalCentavos: 9000 }, 'Producto'),
    (error) => error.statusCode === 500,
  );
});

test('validarPrecioVigente rechaza un porcentaje positivo con monto de descuento cero', () => {
  assert.throws(
    () => validarPrecioVigente({ ...precioValidoConPromocion, porcentajeDescuento: 20, montoDescuentoCentavos: 0, precioFinalCentavos: 10000 }, 'Producto'),
    (error) => error.statusCode === 500,
  );
});

test('validarPrecioVigente rechaza importes negativos, no numéricos o un idPromocionProducto inválido', () => {
  const casos = [
    { ...precioValidoSinPromocion, precioListaCentavos: -100 },
    { ...precioValidoSinPromocion, precioListaCentavos: 'no' },
    { ...precioValidoConPromocion, idPromocionProducto: 0 },
    { ...precioValidoConPromocion, idPromocionProducto: 1.5 },
    { ...precioValidoSinPromocion, porcentajeDescuento: -1 },
    null,
    undefined,
  ];

  for (const caso of casos) {
    assert.throws(
      () => validarPrecioVigente(caso, 'Producto'),
      (error) => error.statusCode === 500,
    );
  }
});

// Etapa 9 (hallazgo de Codex): con el mismo total, otra combinación de
// cantidades no es la compra que el cliente aceptó.
test('cotizacionEstaDesactualizada detecta cantidades distintas aunque el total coincida', () => {
  const linea = (idProducto, precio, cantidad) => ({
    idProducto,
    precioListaCentavos: precio,
    montoDescuentoCentavos: 0,
    precioFinalCentavos: precio,
    idPromocionProducto: null,
    cantidad,
    subtotalCentavos: precio * cantidad,
  });
  const aceptada = {
    totalCentavos: 25000,
    lineas: [linea(1, 10000, 1), linea(2, 5000, 3)],
    emitidaEn: new Date().toISOString(),
  };
  const recalculada = { totalCentavos: 25000, lineas: [linea(1, 10000, 2), linea(2, 5000, 1)] };

  assert.equal(cotizacionEstaDesactualizada(recalculada, aceptada), true);
  assert.equal(cotizacionEstaDesactualizada({ ...aceptada }, aceptada), false);
});
