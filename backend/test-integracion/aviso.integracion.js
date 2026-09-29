// Prueba de integración real contra petshop_test. No se ejecuta con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import Aviso from '../src/models/aviso.model.js';
import { cotizar, aRespuestaPublica } from '../src/services/cotizacion.service.js';
import { confirmarCompra } from '../src/services/compra.service.js';
import { registrarVenta, cancelarVenta, marcarVentaComoEnviada, marcarVentaComoEntregada } from '../src/services/venta.service.js';
import MedioPago from '../src/models/medioPago.model.js';
import { solicitarCancelacion, resolverSolicitudCancelacion } from '../src/services/solicitudCancelacion.service.js';
import { listarAvisosPropios, marcarComoLeido, marcarTodosComoLeidos } from '../src/services/aviso.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearUsuarioDePrueba,
  crearProductoDePrueba,
  crearMediosPagoSimuladosDePrueba,
} from './ayudaIntegracion.js';

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  await crearMediosPagoSimuladosDePrueba();
});

after(async () => {
  await sequelize.close();
});

// Crea un Cliente + Usuario real (idUsuario real, no un literal inventado:
// confirmarCompra crea un Aviso con FK real a usuario.idUsuario) y confirma
// una compra de un producto (transferencia simulada, siempre aprobada).
// Devuelve { venta, usuarioLogin, cliente } para que cada prueba use el
// mismo objeto real en todos lados (nunca un idUsuario distinto "de
// adorno").
const crearClienteConCompraConfirmada = async () => {
  const cliente = await crearClienteDePrueba();
  const usuarioLogin = await crearUsuarioDePrueba({ idCliente: cliente.idCliente });
  const usuarioActor = { idUsuario: usuarioLogin.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };

  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const resultado = await confirmarCompra(
    {
      claveIdempotencia: `clave-${Date.now()}-${Math.random()}`,
      detalles,
      tipoPagoSimulado: 'transferencia',
      cotizacionAceptada: cotizacion,
    },
    usuarioActor,
  );

  assert.equal(resultado.tipo, 'aprobado');
  return { venta: resultado.venta, usuarioLogin, cliente, usuarioActor };
};

test('confirmarCompra genera un aviso "compra_confirmada" real para el comprador', async () => {
  const { venta, usuarioLogin } = await crearClienteConCompraConfirmada();

  const avisos = await listarAvisosPropios(usuarioLogin.idUsuario);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].tipo, 'compra_confirmada');
  assert.equal(avisos[0].leido, false);
  assert.equal(avisos[0].enlace, `/mis-compras/${venta.idVenta}`);
});

test('cancelarVenta (directa, personal) genera un aviso real para el comprador si tiene cuenta', async () => {
  const { venta, usuarioLogin } = await crearClienteConCompraConfirmada();

  await cancelarVenta(venta.idVenta, { idUsuario: 999, rol: 'vendedor' });

  const avisos = await listarAvisosPropios(usuarioLogin.idUsuario);
  const avisoCancelacion = avisos.find((a) => a.tipo === 'venta_cancelada');
  assert.ok(avisoCancelacion, 'debía existir un aviso de venta cancelada');
  assert.match(avisoCancelacion.mensaje, /cancelada por el personal/);
});

test('cancelarVenta sobre un Cliente SIN Usuario asociado no genera ningún aviso (y no falla)', async () => {
  // A propósito, sin crearUsuarioDePrueba: un Cliente cargado por el
  // personal (venta manual) puede no tener ninguna cuenta con la que
  // iniciar sesión.
  const cliente = await crearClienteDePrueba();
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  // Sin Usuario real para este Cliente, confirmarCompra no puede llamarse
  // como lo haría un cliente autenticado de verdad (usuario.idUsuario
  // necesita ser real para SU PROPIO aviso de "compra confirmada"). Se
  // registra la venta directamente por personal en su lugar (mismo escenario
  // real: una venta manual de un Cliente sin cuenta propia), y se verifica
  // que cancelarla no intenta avisar a nadie ni falla.
  const medioPagoDirecto = await MedioPago.create({
    nombre: 'Efectivo de prueba (avisos)',
    habilitado: true,
  });
  const venta = await registrarVenta(
    {
      idCliente: cliente.idCliente,
      idMedioPago: medioPagoDirecto.idMedioPago,
      detalles: [{ idProducto: producto.idProducto, cantidad: 1, precioUnitario: '500.00' }],
    },
    { idUsuario: 999, rol: 'vendedor' },
  );

  await assert.doesNotReject(() => cancelarVenta(venta.idVenta, { idUsuario: 999, rol: 'vendedor' }));

  const cantidadAvisos = await Aviso.count();
  assert.equal(cantidadAvisos, 0, 'no había ninguna cuenta a la que avisar');
});

test('marcarVentaComoEnviada genera un aviso real "venta_enviada" para el comprador', async () => {
  const { venta, usuarioLogin } = await crearClienteConCompraConfirmada();

  await marcarVentaComoEnviada(venta.idVenta);

  const avisos = await listarAvisosPropios(usuarioLogin.idUsuario);
  assert.ok(avisos.some((a) => a.tipo === 'venta_enviada'));
});

test('marcarVentaComoEnviada para retiro en sucursal genera "venta_lista_para_retirar" (Etapa 7)', async () => {
  const { venta, usuarioLogin } = await crearClienteConCompraConfirmada();
  // La compra confirmada por checkout no manda metodoEntrega (siempre es
  // 'envío a domicilio' implícito salvo que se indique lo contrario); acá
  // se fuerza a 'retiro en sucursal' directamente sobre la fila para
  // aislar el comportamiento de marcarVentaComoEnviada en esta prueba.
  await venta.update({ metodoEntrega: 'retiro en sucursal' });

  await marcarVentaComoEnviada(venta.idVenta);

  const avisos = await listarAvisosPropios(usuarioLogin.idUsuario);
  const aviso = avisos.find((a) => a.tipo === 'venta_lista_para_retirar');
  assert.ok(aviso, 'debía existir un aviso de "lista para retirar"');
  assert.match(aviso.mensaje, /lista para retirar/);
});

test('marcarVentaComoEntregada genera un aviso real "venta_entregada" para el comprador', async () => {
  const { venta, usuarioLogin } = await crearClienteConCompraConfirmada();

  await marcarVentaComoEnviada(venta.idVenta);
  await marcarVentaComoEntregada(venta.idVenta);

  const avisos = await listarAvisosPropios(usuarioLogin.idUsuario);
  assert.ok(avisos.some((a) => a.tipo === 'venta_entregada'));
});

test('solicitarCancelacion notifica a TODO el personal (vendedor y administrador), no a otros clientes', async () => {
  const { venta, usuarioActor } = await crearClienteConCompraConfirmada();
  const vendedor = await crearUsuarioDePrueba({ rol: 'vendedor', idCliente: null });
  const administrador = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  const otroCliente = await crearUsuarioDePrueba();

  await solicitarCancelacion(venta.idVenta, usuarioActor);

  const avisosVendedor = await listarAvisosPropios(vendedor.idUsuario);
  const avisosAdministrador = await listarAvisosPropios(administrador.idUsuario);
  const avisosOtroCliente = await listarAvisosPropios(otroCliente.idUsuario);

  assert.ok(avisosVendedor.some((a) => a.tipo === 'solicitud_nueva'));
  assert.ok(avisosAdministrador.some((a) => a.tipo === 'solicitud_nueva'));
  assert.equal(avisosOtroCliente.length, 0, 'un cliente ajeno no debía recibir el aviso de personal');
});

test('resolverSolicitudCancelacion (aprobar/rechazar) genera el aviso correcto para el comprador', async () => {
  const compraA = await crearClienteConCompraConfirmada();
  const compraB = await crearClienteConCompraConfirmada();
  const administrador = { idUsuario: 900, rol: 'administrador', idCliente: null };

  const ventaConSolicitudA = await solicitarCancelacion(compraA.venta.idVenta, compraA.usuarioActor);
  const ventaConSolicitudB = await solicitarCancelacion(compraB.venta.idVenta, compraB.usuarioActor);

  const idSolicitudA = ventaConSolicitudA.solicitudesCancelacion[0].idSolicitud;
  const idSolicitudB = ventaConSolicitudB.solicitudesCancelacion[0].idSolicitud;

  await resolverSolicitudCancelacion(idSolicitudA, 'aprobar', administrador);
  await resolverSolicitudCancelacion(idSolicitudB, 'rechazar', administrador, 'Fuera del plazo permitido');

  const avisosA = await listarAvisosPropios(compraA.usuarioLogin.idUsuario);
  const avisosB = await listarAvisosPropios(compraB.usuarioLogin.idUsuario);

  assert.ok(avisosA.some((a) => a.tipo === 'solicitud_aprobada'));
  const avisoRechazo = avisosB.find((a) => a.tipo === 'solicitud_rechazada');
  assert.ok(avisoRechazo);
  assert.match(avisoRechazo.mensaje, /Fuera del plazo permitido/);
});

test('marcarComoLeido es propio: no afecta el aviso de otro usuario, y es idempotente', async () => {
  const { usuarioLogin } = await crearClienteConCompraConfirmada();

  const [aviso] = await listarAvisosPropios(usuarioLogin.idUsuario);
  assert.equal(aviso.leido, false);

  // Otro usuario intenta marcar el aviso ajeno: no debía tener efecto.
  await marcarComoLeido(999999, aviso.idAviso);
  const sigueSinLeer = await Aviso.findByPk(aviso.idAviso);
  assert.equal(sigueSinLeer.leido, false);

  await marcarComoLeido(usuarioLogin.idUsuario, aviso.idAviso);
  const yaLeido = await Aviso.findByPk(aviso.idAviso);
  assert.equal(yaLeido.leido, true);

  await assert.doesNotReject(() => marcarComoLeido(usuarioLogin.idUsuario, aviso.idAviso));
});

test('marcarTodosComoLeidos marca únicamente los propios', async () => {
  const compraA = await crearClienteConCompraConfirmada();
  const compraB = await crearClienteConCompraConfirmada();

  await marcarTodosComoLeidos(compraA.usuarioLogin.idUsuario);

  const avisosA = await listarAvisosPropios(compraA.usuarioLogin.idUsuario);
  const avisosB = await listarAvisosPropios(compraB.usuarioLogin.idUsuario);
  assert.ok(avisosA.every((a) => a.leido === true));
  assert.ok(avisosB.every((a) => a.leido === false));
});

test('camino HTTP completo: GET lista solo lo propio, POST marca uno y luego todos', async () => {
  const cliente = await crearClienteDePrueba();
  const usuarioLogin = await crearUsuarioDePrueba({ idCliente: cliente.idCliente, password: 'ClaveDePrueba123' });
  const usuarioActor = { idUsuario: usuarioLogin.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };

  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  await confirmarCompra(
    {
      claveIdempotencia: `clave-${Date.now()}-${Math.random()}`,
      detalles,
      tipoPagoSimulado: 'transferencia',
      cotizacionAceptada: cotizacion,
    },
    usuarioActor,
  );

  const agente = request.agent(app);
  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: usuarioLogin.email, password: 'ClaveDePrueba123' })
    .expect(200);

  const respuestaLista = await agente.get('/api/avisos').expect(200);
  assert.equal(respuestaLista.body.length, 1);
  const idAviso = respuestaLista.body[0].idAviso;

  await agente.post(`/api/avisos/${idAviso}/leido`).set('X-CSRF-Token', body.csrfToken).expect(204);

  const trasUno = await agente.get('/api/avisos').expect(200);
  assert.equal(trasUno.body[0].leido, true);

  await agente.post('/api/avisos/leidos').set('X-CSRF-Token', body.csrfToken).expect(204);
  const trasTodos = await agente.get('/api/avisos').expect(200);
  assert.ok(trasTodos.body.every((a) => a.leido === true));
});

test('GET /api/avisos sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/avisos').expect(401);
  assert.equal(respuesta.body.error, 'Se requiere iniciar sesión');
});
