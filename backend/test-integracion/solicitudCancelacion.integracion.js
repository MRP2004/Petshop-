// Pruebas de integración real contra MySQL para la solicitud de cancelación
// del cliente (CU-04, corrección — revisión de Mauro sobre la venta #20):
// el cliente ya no cancela directamente (ver compra.integracion.js), pide la
// cancelación y el personal la aprueba o la rechaza. Requiere petshop_test
// ya preparada (ver docs/backend-base-de-datos.md) y NO corre con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/database.js';
import Venta from '../src/models/venta.model.js';
import Producto from '../src/models/producto.model.js';
import SolicitudCancelacion from '../src/models/solicitudCancelacion.model.js';
import { registrarVenta, marcarVentaComoEnviada, cancelarVenta } from '../src/services/venta.service.js';
import { solicitarCancelacion, resolverSolicitudCancelacion } from '../src/services/solicitudCancelacion.service.js';
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
let usuarioCliente;
const usuarioVendedor = { idUsuario: 999, rol: 'vendedor', idCliente: null };

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  cliente = await crearClienteDePrueba();
  medioPago = await crearMedioPagoDePrueba();
  usuarioCliente = { idUsuario: 1, rol: 'cliente', idCliente: cliente.idCliente };
});

after(async () => {
  await sequelize.close();
});

const crearVentaDePrueba = async (overrides = {}) => {
  const producto = await crearProductoDePrueba({ stockActual: 10 });
  const venta = await registrarVenta({
    idCliente: cliente.idCliente,
    idMedioPago: medioPago.idMedioPago,
    detalles: [{ idProducto: producto.idProducto, cantidad: 4 }],
    ...overrides,
  });
  return { venta, producto };
};

test('solicitarCancelacion: registra la solicitud SIN tocar la venta, el pago ni el stock', async () => {
  const { venta, producto } = await crearVentaDePrueba();

  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);

  assert.equal(ventaConSolicitud.estado, 'registrada');
  assert.equal(ventaConSolicitud.solicitudesCancelacion.length, 1);
  assert.equal(ventaConSolicitud.solicitudesCancelacion[0].estado, 'pendiente');

  const productoIntacto = await Producto.findByPk(producto.idProducto);
  assert.equal(productoIntacto.stockActual, 6); // 10 - 4, sin restituir nada todavía
});

test('solicitarCancelacion: un cliente no puede solicitar la cancelación de la venta de OTRO cliente', async () => {
  const { venta } = await crearVentaDePrueba();
  const otroCliente = await crearClienteDePrueba({ email: 'otro@petshop.test' });
  const usuarioOtroCliente = { idUsuario: 2, rol: 'cliente', idCliente: otroCliente.idCliente };

  await assert.rejects(
    () => solicitarCancelacion(venta.idVenta, usuarioOtroCliente),
    (error) => error.statusCode === 403,
  );
});

test('solicitarCancelacion: solo sobre una venta "registrada" (no "enviada")', async () => {
  const { venta } = await crearVentaDePrueba();
  await marcarVentaComoEnviada(venta.idVenta);

  await assert.rejects(
    () => solicitarCancelacion(venta.idVenta, usuarioCliente),
    (error) => error.statusCode === 409,
  );
});

test('solicitarCancelacion: rechaza una solicitud duplicada mientras haya una pendiente', async () => {
  const { venta } = await crearVentaDePrueba();
  await solicitarCancelacion(venta.idVenta, usuarioCliente);

  await assert.rejects(
    () => solicitarCancelacion(venta.idVenta, usuarioCliente),
    (error) => error.statusCode === 409,
  );

  const solicitudes = await SolicitudCancelacion.findAll({ where: { idVenta: venta.idVenta } });
  assert.equal(solicitudes.length, 1);
});

test('resolverSolicitudCancelacion (aprobar): reutiliza la cancelación transaccional — restituye stock y revierte el pago si existe', async () => {
  const { venta, producto } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  const ventaCancelada = await resolverSolicitudCancelacion(idSolicitud, 'aprobar', usuarioVendedor);

  assert.equal(ventaCancelada.estado, 'cancelada');
  assert.equal(ventaCancelada.solicitudesCancelacion[0].estado, 'aprobada');
  assert.ok(ventaCancelada.solicitudesCancelacion[0].resueltoEn);
  assert.equal(ventaCancelada.solicitudesCancelacion[0].idUsuarioResolvio, usuarioVendedor.idUsuario);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10); // restituido
});

test('resolverSolicitudCancelacion (rechazar): la venta sigue vigente, sin tocar stock ni pago', async () => {
  const { venta, producto } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  const ventaTrasRechazo = await resolverSolicitudCancelacion(
    idSolicitud,
    'rechazar',
    usuarioVendedor,
    'Stock ya reservado para retiro en sucursal',
  );

  assert.equal(ventaTrasRechazo.estado, 'registrada');
  assert.equal(ventaTrasRechazo.solicitudesCancelacion[0].estado, 'rechazada');
  assert.equal(
    ventaTrasRechazo.solicitudesCancelacion[0].motivoRechazo,
    'Stock ya reservado para retiro en sucursal',
  );

  const productoIntacto = await Producto.findByPk(producto.idProducto);
  assert.equal(productoIntacto.stockActual, 6);
});

test('resolverSolicitudCancelacion: un cliente no puede aprobar ni rechazar (403)', async () => {
  const { venta } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  await assert.rejects(
    () => resolverSolicitudCancelacion(idSolicitud, 'aprobar', usuarioCliente),
    (error) => error.statusCode === 403,
  );
});

test('resolverSolicitudCancelacion: decisiones repetidas se rechazan (una solicitud ya resuelta no vuelve a decidirse)', async () => {
  const { venta } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  await resolverSolicitudCancelacion(idSolicitud, 'rechazar', usuarioVendedor);

  await assert.rejects(
    () => resolverSolicitudCancelacion(idSolicitud, 'aprobar', usuarioVendedor),
    (error) => error.statusCode === 409,
  );
});

test('cancelarVenta (directa): si había una solicitud pendiente, la cierra sola como "aprobada" — no queda huérfana', async () => {
  const { venta, producto } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  // El personal cancela DIRECTAMENTE mientras la solicitud seguía pendiente
  // (carrera legítima: no pasó por la solicitud del cliente). Hallazgo real
  // de una revisión independiente: la primera versión de esta corrección
  // dejaba esa solicitud "pendiente" para siempre — un estado de negocio
  // confuso, aunque nunca duplicara stock ni pago. Ahora se cierra sola.
  const ventaCancelada = await cancelarVenta(venta.idVenta, usuarioVendedor);

  const solicitudCerrada = ventaCancelada.solicitudesCancelacion.find(
    (s) => s.idSolicitud === idSolicitud,
  );
  assert.equal(solicitudCerrada.estado, 'aprobada');
  assert.equal(solicitudCerrada.idUsuarioResolvio, usuarioVendedor.idUsuario);
  assert.ok(solicitudCerrada.resueltoEn);

  // Intentar resolverla de nuevo (aprobar) se rechaza como cualquier
  // decisión repetida — ya no está 'pendiente'.
  await assert.rejects(
    () => resolverSolicitudCancelacion(idSolicitud, 'aprobar', usuarioVendedor),
    (error) => error.statusCode === 409,
  );

  // Un solo restituido, no dos (la cancelación directa ya lo hizo).
  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10);
});

test('marcarVentaComoEnviada: si había una solicitud pendiente, la cierra sola como "rechazada" con un motivo explicativo', async () => {
  const { venta } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  const ventaEnviada = await marcarVentaComoEnviada(venta.idVenta);

  assert.equal(ventaEnviada.estado, 'enviada');
  const solicitudCerrada = ventaEnviada.solicitudesCancelacion.find(
    (s) => s.idSolicitud === idSolicitud,
  );
  assert.equal(solicitudCerrada.estado, 'rechazada');
  assert.match(solicitudCerrada.motivoRechazo, /enviada/);
});

test('concurrencia real (contención confirmada): aprobar la misma solicitud dos veces a la vez, solo una transición exitosa', async () => {
  const { venta, producto } = await crearVentaDePrueba();
  const ventaConSolicitud = await solicitarCancelacion(venta.idVenta, usuarioCliente);
  const idSolicitud = ventaConSolicitud.solicitudesCancelacion[0].idSolicitud;

  const { idConexion, liberar } = await retenerBloqueoDeFila('venta', 'idVenta', venta.idVenta);

  try {
    const promesas = [
      resolverSolicitudCancelacion(idSolicitud, 'aprobar', usuarioVendedor),
      resolverSolicitudCancelacion(idSolicitud, 'aprobar', usuarioVendedor),
    ].map((p) => p.catch((error) => ({ rechazada: true, error })));

    const huboContencion = await esperarContencionSobre(idConexion, { timeoutMs: 3000 });
    assert.equal(huboContencion, true, 'no se detectó contención real sobre el bloqueo retenido');

    await liberar();

    const resultados = await Promise.all(promesas);
    const exitosas = resultados.filter((r) => !r?.rechazada);
    const rechazadas = resultados.filter((r) => r?.rechazada);

    assert.equal(exitosas.length, 1, 'exactamente una de las dos aprobaciones debía ganar');
    assert.equal(rechazadas.length, 1);
    assert.equal(rechazadas[0].error.statusCode, 409);
  } finally {
    await liberar();
  }

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10); // restituido UNA sola vez, no dos

  const ventaFinal = await Venta.findByPk(venta.idVenta);
  assert.equal(ventaFinal.estado, 'cancelada');
});

test('concurrencia real (contención confirmada): solicitar cancelación al mismo tiempo que el personal cancela directamente — sin duplicar la restitución de stock', async () => {
  const { venta, producto } = await crearVentaDePrueba();

  const { idConexion, liberar } = await retenerBloqueoDeFila('venta', 'idVenta', venta.idVenta);

  try {
    const promesas = [
      solicitarCancelacion(venta.idVenta, usuarioCliente),
      cancelarVenta(venta.idVenta, usuarioVendedor),
    ].map((p) => p.then((r) => ({ ok: true, r })).catch((error) => ({ ok: false, error })));

    const huboContencion = await esperarContencionSobre(idConexion, { timeoutMs: 3000 });
    assert.equal(huboContencion, true, 'no se detectó contención real sobre el bloqueo retenido');

    await liberar();

    const [resultadoSolicitud, resultadoCancelacion] = await Promise.all(promesas);

    // El orden en que la fila de Venta bloqueada se libera para cada una de
    // las dos transacciones en espera no está bajo control de esta prueba
    // (depende de MySQL) — las dos combinaciones válidas son "ambas tienen
    // éxito" (la solicitud ganó el turno primero, sobre una venta que
    // seguía 'registrada'; la cancelación directa del personal, después,
    // la cierra sola como 'aprobada' — ver
    // venta.service.js#cerrarSolicitudesPendientesPorCambioDirecto, hallazgo
    // real de una revisión independiente: la primera versión dejaba esa
    // solicitud pendiente para siempre) o "la cancelación directa gana
    // primero y la solicitud, al ver la venta ya 'cancelada', se rechaza
    // con 409" — lo que NUNCA puede pasar es un error inesperado (500) de
    // ningún lado, ni una restitución de stock duplicada, ni una solicitud
    // que quede 'pendiente' sin que nadie la resuelva.
    for (const resultado of [resultadoSolicitud, resultadoCancelacion]) {
      if (!resultado.ok) {
        assert.equal(resultado.error.statusCode, 409, `error inesperado: ${resultado.error.message}`);
      }
    }
    assert.equal(resultadoCancelacion.ok, true, 'la cancelación directa del personal no debería fallar');
  } finally {
    await liberar();
  }

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10); // restituido UNA sola vez, nunca dos

  const ventaFinal = await Venta.findByPk(venta.idVenta);
  assert.equal(ventaFinal.estado, 'cancelada');

  // Nunca queda una solicitud "pendiente" sin resolver, sin importar cuál
  // de las dos operaciones ganó la carrera.
  const solicitudesPendientes = await SolicitudCancelacion.findAll({
    where: { idVenta: venta.idVenta, estado: 'pendiente' },
  });
  assert.equal(solicitudesPendientes.length, 0);
});
