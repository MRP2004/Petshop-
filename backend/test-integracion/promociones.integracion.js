// Pruebas de integración de promociones contra MySQL real. Requieren la
// configuración aislada petshop_test y PERMITIR_LIMPIEZA_INTEGRACION=si.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import DetalleVentaPromocion from '../src/models/detalleVentaPromocion.model.js';
import { tokenAdministrador, autorizacion } from '../test/ayudaAutenticacion.js';
import { crearPromocion } from '../src/services/promocionProducto.service.js';
import { cotizar, aRespuestaPublica } from '../src/services/cotizacion.service.js';
import { confirmarCompra } from '../src/services/compra.service.js';
import { registrarVenta } from '../src/services/venta.service.js';
import obtenerFechaArgentina from '../src/utils/fechaArgentina.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearUsuarioDePrueba,
  crearMedioPagoDePrueba,
  crearMediosPagoSimuladosDePrueba,
  crearProductoDePrueba,
  crearVendedorIndependienteDePrueba,
} from './ayudaIntegracion.js';

let cliente;
let usuarioCliente;

const sumarDias = (fecha, cantidad) => {
  const resultado = new Date(`${fecha}T00:00:00.000Z`);
  resultado.setUTCDate(resultado.getUTCDate() + cantidad);
  return resultado.toISOString().slice(0, 10);
};

const promocionPara = (producto, fechaInicio, fechaFin, descuento = 10) =>
  crearPromocion({
    idProducto: producto.idProducto,
    fechaInicio,
    fechaFin,
    descuento,
  });

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  cliente = await crearClienteDePrueba({ email: 'promociones@petshop.test' });
  const usuario = await crearUsuarioDePrueba({ idCliente: cliente.idCliente });
  usuarioCliente = {
    idUsuario: usuario.idUsuario,
    rol: 'cliente',
    idCliente: cliente.idCliente,
  };
  await crearMediosPagoSimuladosDePrueba();
});

after(async () => {
  await sequelize.close();
});

test('rechaza intervalos que se tocan en una fecha inclusiva y permite el día siguiente', async () => {
  const producto = await crearProductoDePrueba();
  const hoy = obtenerFechaArgentina();
  const manana = sumarDias(hoy, 1);

  await promocionPara(producto, hoy, manana, 10);

  await assert.rejects(
    () => promocionPara(producto, manana, sumarDias(manana, 2), 20),
    (error) => error.statusCode === 409,
  );

  const siguiente = await promocionPara(
    producto,
    sumarDias(manana, 1),
    sumarDias(manana, 2),
    20,
  );
  assert.equal(siguiente.descuento, '20.00');
});

test('dos altas concurrentes superpuestas para el mismo producto no pueden aprobarse ambas', async () => {
  const producto = await crearProductoDePrueba();
  const hoy = obtenerFechaArgentina();
  const manana = sumarDias(hoy, 1);

  const resultados = await Promise.allSettled([
    promocionPara(producto, hoy, manana, 10),
    promocionPara(producto, manana, sumarDias(manana, 2), 20),
  ]);

  assert.equal(resultados.filter((resultado) => resultado.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((resultado) => resultado.status === 'rejected').length, 1);
  const rechazada = resultados.find((resultado) => resultado.status === 'rejected');
  assert.equal(rechazada.reason.statusCode, 409);
});

test('el listado público devuelve solo promociones vigentes; el listado de gestión conserva todas', async () => {
  const producto = await crearProductoDePrueba();
  const hoy = obtenerFechaArgentina();
  await promocionPara(producto, hoy, hoy, 15);
  await promocionPara(producto, sumarDias(hoy, 1), sumarDias(hoy, 2), 20);

  const publico = await request(app).get('/api/promociones').expect(200);
  assert.equal(publico.body.length, 1);
  assert.equal(publico.body[0].descuento, '15.00');

  const gestion = await request(app)
    .get('/api/promociones/gestion')
    .set('Authorization', autorizacion(tokenAdministrador()))
    .expect(200);
  assert.equal(gestion.body.length, 2);
});

test('las promociones públicas ocultan tiendas suspendidas y gestión las conserva', async () => {
  const activa = await crearVendedorIndependienteDePrueba();
  const suspendida = await crearVendedorIndependienteDePrueba({ tienda: { estado: 'suspendida' } });
  const hoy = obtenerFechaArgentina();
  const promociones = [];
  for (const idTienda of [null, activa.tienda.idTienda, suspendida.tienda.idTienda]) {
    const producto = await crearProductoDePrueba({ idTienda });
    promociones.push(await promocionPara(producto, hoy, hoy));
  }
  const idsVisibles = promociones.slice(0, 2).map((p) => p.idPromocionProducto).sort((a, b) => a - b);
  const publico = await request(app).get('/api/promociones').expect(200);
  const detalleSuspendida = await request(app).get(`/api/promociones/${promociones[2].idPromocionProducto}`);
  for (const promocion of promociones.slice(0, 2)) {
    const detalle = await request(app).get(`/api/promociones/${promocion.idPromocionProducto}`).expect(200);
    assert.equal(detalle.body.idPromocionProducto, promocion.idPromocionProducto);
  }
  const gestion = await request(app)
    .get('/api/promociones/gestion')
    .set('Authorization', autorizacion(tokenAdministrador()))
    .expect(200);
  assert.deepEqual(gestion.body.map((p) => p.idPromocionProducto).sort((a, b) => a - b),
    promociones.map((p) => p.idPromocionProducto).sort((a, b) => a - b));
  assert.deepEqual({
    idsPublicos: publico.body.map((p) => p.idPromocionProducto).sort((a, b) => a - b),
    estadoDetalleSuspendida: detalleSuspendida.status,
  }, { idsPublicos: idsVisibles, estadoDetalleSuspendida: 404 });
});

test('la promoción real se refleja en la cotización y en la compra confirmada', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 5 });
  const hoy = obtenerFechaArgentina();
  await promocionPara(producto, hoy, hoy, 25);

  const detalles = [{ idProducto: producto.idProducto, cantidad: 2 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  assert.equal(cotizacion.totalCentavos, 150000);

  const resultado = await confirmarCompra(
    {
      claveIdempotencia: crypto.randomUUID(),
      detalles,
      metodoEntrega: 'retiro en sucursal',
      tipoPagoSimulado: 'transferencia',
      cotizacionAceptada: cotizacion,
    },
    usuarioCliente,
  );

  assert.equal(resultado.venta.total, '1500.00');
  assert.equal(resultado.venta.detalles[0].promocionAplicada.porcentajeDescuento, '25.00');
  assert.equal(resultado.venta.detalles[0].precioUnitario, '750.00');
});

test('la venta manual aplica promoción por producto y luego el descuento manual', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 5 });
  const medioPago = await crearMedioPagoDePrueba();
  const hoy = obtenerFechaArgentina();
  await promocionPara(producto, hoy, hoy, 10);

  const venta = await registrarVenta(
    {
      idCliente: cliente.idCliente,
      idMedioPago: medioPago.idMedioPago,
      descuento: '1.50',
      detalles: [{ idProducto: producto.idProducto, cantidad: 2 }],
    },
    { idUsuario: 10, rol: 'vendedor' },
  );

  assert.equal(venta.total, '1798.50');
  assert.equal(venta.descuento, '1.50');
  assert.equal(venta.detalles[0].precioUnitario, '900.00');
  assert.equal(venta.detalles[0].subtotal, '1800.00');
  assert.equal(venta.detalles[0].promocionAplicada.montoDescuentoUnitario, '100.00');

  const historia = await DetalleVentaPromocion.findByPk(venta.detalles[0].idDetalleVenta);
  assert.equal(historia.idPromocionProducto > 0, true);
});
