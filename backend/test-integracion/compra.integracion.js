// Pruebas de integración real contra MySQL para el checkout con pago
// simulado (CU-04): cotización, confirmación atómica, idempotencia,
// concurrencia, cancelación e histórico inmutable. Mismo criterio que
// ventaConcurrencia.integracion.js: requieren petshop_test ya preparada
// (ver docs/backend-base-de-datos.md) y NO corren con `npm test`.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import sequelize from '../src/config/database.js';
import Venta from '../src/models/venta.model.js';
import DetalleVenta from '../src/models/detalleVenta.model.js';
import Pago from '../src/models/pago.model.js';
import Comprobante from '../src/models/comprobante.model.js';
import IntentoCompra from '../src/models/intentoCompra.model.js';
import Producto from '../src/models/producto.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import { confirmarCompra, consultarIntento } from '../src/services/compra.service.js';
import { cotizar, aRespuestaPublica } from '../src/services/cotizacion.service.js';
import { cancelarVenta, obtenerVentaPorId } from '../src/services/venta.service.js';
import { MAXIMO_IMPORTE_CENTAVOS } from '../src/utils/validacion.js';
import crearProveedorPrecioDePrueba from './proveedorPrecioDePrueba.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearUsuarioDePrueba,
  crearMediosPagoSimuladosDePrueba,
  crearProductoDePrueba,
} from './ayudaIntegracion.js';

let cliente;
let usuarioCliente;
let usuarioVendedor;

const NUMERO_TARJETA_APROBADA = '4000000000000002';
const NUMERO_TARJETA_RECHAZADA = '4000000000000010';
const VENCIMIENTO_FUTURO = (() => {
  const fecha = new Date();
  fecha.setFullYear(fecha.getFullYear() + 2);
  return `${String(fecha.getMonth() + 1).padStart(2, '0')}/${String(fecha.getFullYear()).slice(-2)}`;
})();

const datosDebitoAprobado = {
  numero: NUMERO_TARJETA_APROBADA,
  titular: 'Cliente De Prueba',
  vencimiento: VENCIMIENTO_FUTURO,
  codigoSeguridad: '123',
};

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
  cliente = await crearClienteDePrueba({ email: 'cliente-cu04@petshop.test' });
  // idUsuario real (no un literal inventado): desde la Etapa 6 (avisos in-app,
  // ronda 2), confirmarCompra crea un Aviso con FK real a usuario.idUsuario —
  // un idUsuario que no existiera en la base haría fallar la inserción del
  // aviso con una violación de clave foránea real.
  const loginCliente = await crearUsuarioDePrueba({ idCliente: cliente.idCliente });
  usuarioCliente = { idUsuario: loginCliente.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };
  usuarioVendedor = { idUsuario: 999, rol: 'vendedor', idCliente: null };
  await crearMediosPagoSimuladosDePrueba();
});

after(async () => {
  await sequelize.close();
});

const nuevaClave = () => crypto.randomUUID();

// Arma el cuerpo de confirmarCompra a partir de una cotización YA aceptada
// (misma forma que mandaría el frontend real: aRespuestaPublica). Reduce
// repetición en cada test.
const armarDatosCompra = ({ detalles, cotizacionAceptada, claveIdempotencia, tipoPagoSimulado = 'transferencia', datosDebito, metodoEntrega, direccionEntrega }) => ({
  claveIdempotencia: claveIdempotencia ?? nuevaClave(),
  detalles,
  metodoEntrega,
  direccionEntrega,
  tipoPagoSimulado,
  datosDebito,
  cotizacionAceptada,
});

test('compra sin promoción, transferencia simulada: aprobada, descuenta stock, genera comprobante', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 3 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const resultado = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
  );

  assert.equal(resultado.tipo, 'aprobado');
  assert.equal(resultado.venta.total, '3000.00');
  assert.equal(resultado.venta.pago.estado, 'aprobado_simulado');
  assert.equal(resultado.venta.pago.tipo, 'transferencia');
  assert.ok(resultado.venta.comprobante.numero.startsWith('PS-'));
  assert.equal(resultado.venta.comprobante.estadoCorreo, 'simulado'); // transporte de prueba (jsonTransport), nunca "enviado"
  assert.equal(resultado.venta.comprobante.nombreCompradorHistorico, cliente.nombre);
  assert.equal(resultado.venta.comprobante.correoCompradorHistorico, cliente.email);

  const productoActualizado = await Producto.findByPk(producto.idProducto);
  assert.equal(productoActualizado.stockActual, 7);
});

test('compra con promoción (proveedor de precios controlado): aplica descuento y lo persiste como histórico', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 2 }];
  const proveedorPrecios = crearProveedorPrecioDePrueba(
    new Map([[producto.idProducto, { idPromocionProducto: 7, porcentajeDescuento: 20 }]]),
  );
  const cotizacion = aRespuestaPublica(await cotizar(detalles, { proveedorPrecios }));

  const resultado = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
    { proveedorPrecios },
  );

  assert.equal(resultado.tipo, 'aprobado');
  // 1000 -20% = 800 por unidad, x2 = 1600.
  assert.equal(resultado.venta.total, '1600.00');

  const detalle = resultado.venta.detalles[0];
  assert.equal(detalle.promocionAplicada.idPromocionProducto, 7);
  assert.equal(detalle.promocionAplicada.porcentajeDescuento, '20.00');
  assert.equal(detalle.promocionAplicada.precioListaUnitario, '1000.00');
  assert.equal(detalle.promocionAplicada.montoDescuentoUnitario, '200.00');
});

test('promoción vencida / precio modificado entre la cotización y la confirmación: 409, no crea venta ni toca stock', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacionVieja = aRespuestaPublica(await cotizar(detalles));

  // El precio cambia DESPUÉS de cotizar, ANTES de confirmar.
  await producto.update({ precio: '1500.00' });

  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles, cotizacionAceptada: cotizacionVieja }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 409 && error.codigo === 'COTIZACION_DESACTUALIZADA',
  );

  assert.equal(await Venta.count(), 0);
  assert.equal(await IntentoCompra.count(), 0, 'el intento debía revertirse junto con el resto: la clave queda libre');

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10);
});

test('precio manipulado por el navegador: nunca se cobra el valor manipulado, se exige reconfirmar', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacionReal = aRespuestaPublica(await cotizar(detalles));

  const cotizacionManipulada = {
    ...cotizacionReal,
    totalCentavos: 1, // "aceptó" pagar 1 centavo
    lineas: cotizacionReal.lineas.map((linea) => ({ ...linea, precioFinalCentavos: 1 })),
  };

  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles, cotizacionAceptada: cotizacionManipulada }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 409,
  );

  assert.equal(await Venta.count(), 0, 'jamás debía registrarse una venta al precio manipulado');
});

test('débito simulado aprobado: crea venta y pago con los últimos 4 dígitos', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const resultado = await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      tipoPagoSimulado: 'debito',
      datosDebito: datosDebitoAprobado,
    }),
    usuarioCliente,
  );

  assert.equal(resultado.tipo, 'aprobado');
  assert.equal(resultado.venta.pago.tipo, 'debito');
  assert.equal(resultado.venta.pago.ultimosCuatroDigitos, '0002');
});

test('recuperación tras respuesta perdida: reintentar la MISMA clave con OTRO medio de pago devuelve la venta ya aprobada, sin reprocesar el pago', async () => {
  // Corrección de una revisión independiente (Codex): el hash de contenido
  // de la clave de idempotencia ya no incluye el medio de pago ni datos de
  // tarjeta — si se pierde la respuesta y el formulario de pago se
  // reinicia (recarga de página), reintentar con OTRO medio de pago bajo
  // la misma clave debe encontrar el intento ya resuelto, no un 409 de
  // "contenido distinto".
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  const primeraRespuesta = await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      claveIdempotencia: clave,
      tipoPagoSimulado: 'debito',
      datosDebito: datosDebitoAprobado,
    }),
    usuarioCliente,
  );

  const segundaRespuesta = await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      claveIdempotencia: clave,
      tipoPagoSimulado: 'transferencia', // el formulario se reinició: ahora elige otro medio
    }),
    usuarioCliente,
  );

  assert.equal(segundaRespuesta.tipo, 'aprobado');
  assert.equal(segundaRespuesta.venta.idVenta, primeraRespuesta.venta.idVenta);
  assert.equal(segundaRespuesta.venta.pago.tipo, 'debito'); // el pago real sigue siendo el original
  assert.equal(await Venta.count(), 1);
  assert.equal(await Pago.count(), 1);
});

test('recuperación tras respuesta perdida: reintentar la MISMA clave con datos de tarjeta INVÁLIDOS igual devuelve la venta ya aprobada (no revalida un pago que no hace falta reprocesar)', async () => {
  // Mismo hallazgo de Codex que el caso anterior, en la dirección que su
  // primera corrección todavía no cubría: la aprobación original fue con
  // transferencia (sin datos de tarjeta); el reintento llega con "débito"
  // y una tarjeta con formato inválido — como el intento ya está resuelto,
  // ni siquiera debería llegar a validarse esa tarjeta.
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  const primeraRespuesta = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave }),
    usuarioCliente,
  );

  const segundaRespuesta = await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      claveIdempotencia: clave,
      tipoPagoSimulado: 'debito',
      datosDebito: { numero: '123', titular: '', vencimiento: 'no', codigoSeguridad: '' }, // deliberadamente inválido
    }),
    usuarioCliente,
  );

  assert.equal(segundaRespuesta.tipo, 'aprobado');
  assert.equal(segundaRespuesta.venta.idVenta, primeraRespuesta.venta.idVenta);
  assert.equal(segundaRespuesta.venta.pago.tipo, 'transferencia');
});

test('débito simulado rechazado: no crea venta ni descuenta stock, pero registra el intento como resuelto', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  const resultado = await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      tipoPagoSimulado: 'debito',
      datosDebito: { ...datosDebitoAprobado, numero: NUMERO_TARJETA_RECHAZADA },
      claveIdempotencia: clave,
    }),
    usuarioCliente,
  );

  assert.equal(resultado.tipo, 'rechazado');
  assert.ok(resultado.motivoRechazo);
  assert.equal(await Venta.count(), 0);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 5);

  const intento = await IntentoCompra.findOne({ where: { claveIdempotencia: clave } });
  assert.equal(intento.estado, 'rechazado');
});

test('un intento NUEVO con datos de pago inválidos (tipo desconocido) responde 400, sin crear venta ni dejar la clave "quemada"', async () => {
  // Complementa pagoSimulado.service.test.js (que prueba el formato en
  // aislamiento): esto confirma que, para un intento realmente nuevo, ese
  // 400 también revierte la transacción entera (incluido el INSERT del
  // intento) — la clave queda libre para reintentarse con datos válidos.
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave, tipoPagoSimulado: 'qr' }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 400,
  );

  assert.equal(await Venta.count(), 0);
  assert.equal(await IntentoCompra.count(), 0);

  // La clave sigue libre: reintentar con datos válidos funciona.
  const resultado = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave }),
    usuarioCliente,
  );
  assert.equal(resultado.tipo, 'aprobado');
});

test('stock insuficiente al momento de confirmar (cambió después de cotizar) responde 409 y no toca nada', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 5 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  await producto.update({ stockActual: 1 }); // se vendió/ajustó stock después de cotizar

  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 409,
  );

  assert.equal(await Venta.count(), 0);
});

test('reintento con la MISMA clave e igual contenido, tras una compra ya aprobada: devuelve la misma venta, no descuenta stock de nuevo', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 2 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();
  const datosCompra = armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave });

  const primeraRespuesta = await confirmarCompra(datosCompra, usuarioCliente);

  // El stock cambia después del primer éxito (otra venta, ajuste manual, lo que sea).
  await Producto.update({ stockActual: 1 }, { where: { idProducto: producto.idProducto } });

  const segundaRespuesta = await confirmarCompra(datosCompra, usuarioCliente);

  assert.equal(segundaRespuesta.tipo, 'aprobado');
  assert.equal(segundaRespuesta.venta.idVenta, primeraRespuesta.venta.idVenta);
  assert.equal(await Venta.count(), 1);
  assert.equal(await Pago.count(), 1);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 1, 'el reintento no debía volver a descontar stock');
});

test('misma clave de idempotencia con contenido comercial distinto: se rechaza, sin crear una segunda venta', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const clave = nuevaClave();

  const detallesA = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacionA = aRespuestaPublica(await cotizar(detallesA));
  await confirmarCompra(
    armarDatosCompra({ detalles: detallesA, cotizacionAceptada: cotizacionA, claveIdempotencia: clave }),
    usuarioCliente,
  );

  const detallesB = [{ idProducto: producto.idProducto, cantidad: 2 }]; // contenido distinto, misma clave
  const cotizacionB = aRespuestaPublica(await cotizar(detallesB));

  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles: detallesB, cotizacionAceptada: cotizacionB, claveIdempotencia: clave }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 409 && /contenido distinto/.test(error.message),
  );

  assert.equal(await Venta.count(), 1);
  assert.equal(await IntentoCompra.count(), 1);
});

test('concurrencia real: dos confirmaciones simultáneas con la MISMA clave producen una sola venta', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();
  const datosCompra = armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave });

  const [resultadoA, resultadoB] = await Promise.all([
    confirmarCompra(datosCompra, usuarioCliente),
    confirmarCompra(datosCompra, usuarioCliente),
  ]);

  assert.equal(resultadoA.tipo, 'aprobado');
  assert.equal(resultadoB.tipo, 'aprobado');
  assert.equal(resultadoA.venta.idVenta, resultadoB.venta.idVenta);
  assert.equal(await Venta.count(), 1);
  assert.equal(await Pago.count(), 1);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 9, 'el stock debía descontarse una sola vez, no dos');
});

test('cancelar una compra confirmada (por el personal) revierte el pago simulado y restituye el stock una sola vez', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 4 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
  );

  // Corrección (revisión de Mauro sobre la venta #20): el cliente ya NO
  // puede cancelar directamente su propia compra — solo el personal (ver
  // venta.service.js#cancelarVenta). El caso del cliente ahora pasa por
  // solicitudCancelacion.integracion.js.
  const ventaCancelada = await cancelarVenta(venta.idVenta, usuarioVendedor);
  assert.equal(ventaCancelada.estado, 'cancelada');
  assert.equal(ventaCancelada.pago.estado, 'revertido_simulado');

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 10);

  // Repetida (secuencial): rechazada, sin restituir una segunda vez.
  await assert.rejects(
    () => cancelarVenta(venta.idVenta, usuarioVendedor),
    (error) => error.statusCode === 409,
  );

  const pagoFinal = await Pago.findByPk(venta.idVenta);
  assert.equal(pagoFinal.estado, 'revertido_simulado');
});

test('cancelar una compra confirmada: el propio cliente NO puede cancelarla directamente (403), aunque sea la dueña', async () => {
  const producto = await crearProductoDePrueba({ precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 4 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
  );

  await assert.rejects(
    () => cancelarVenta(venta.idVenta, usuarioCliente),
    (error) => error.statusCode === 403,
  );

  // Nada se tocó: ni el stock, ni el pago, ni el estado de la venta.
  const productoIntacto = await Producto.findByPk(producto.idProducto);
  assert.equal(productoIntacto.stockActual, 6);
  const ventaIntacta = await Venta.findByPk(venta.idVenta);
  assert.equal(ventaIntacta.estado, 'registrada');
});

test('histórico inmutable: editar el producto después de la compra no cambia el detalle ya persistido', async () => {
  const producto = await crearProductoDePrueba({ nombre: 'Nombre original', precio: '1000.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const proveedorPrecios = crearProveedorPrecioDePrueba(
    new Map([[producto.idProducto, { idPromocionProducto: 3, porcentajeDescuento: 10 }]]),
  );
  const cotizacion = aRespuestaPublica(await cotizar(detalles, { proveedorPrecios }));

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
    { proveedorPrecios },
  );

  await producto.update({ nombre: 'Nombre cambiado después', precio: '9999.00' });

  const ventaReleida = await obtenerVentaPorId(venta.idVenta, usuarioCliente);
  const detalle = ventaReleida.detalles[0];

  assert.equal(detalle.promocionAplicada.nombreProductoHistorico, 'Nombre original');
  assert.equal(detalle.promocionAplicada.precioListaUnitario, '1000.00');
  assert.equal(detalle.precioUnitario, '900.00'); // 1000 - 10%, sin cambios
});

test('acceso ajeno: un cliente no puede ver la compra de otro cliente', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
  );

  const otroCliente = await crearClienteDePrueba({ email: 'otro-cliente@petshop.test' });
  const usuarioAjeno = { idUsuario: 2, rol: 'cliente', idCliente: otroCliente.idCliente };

  await assert.rejects(
    () => obtenerVentaPorId(venta.idVenta, usuarioAjeno),
    (error) => error.statusCode === 403,
  );
});

test('un cliente sin correo electrónico: el comprobante queda en "no_aplica", sin registrar un intento de envío', async () => {
  const clienteSinEmail = await crearClienteDePrueba({ email: null });
  const loginSinEmail = await crearUsuarioDePrueba({ idCliente: clienteSinEmail.idCliente });
  const usuarioSinEmail = { idUsuario: loginSinEmail.idUsuario, rol: 'cliente', idCliente: clienteSinEmail.idCliente };
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioSinEmail,
  );

  assert.equal(venta.comprobante.estadoCorreo, 'no_aplica');
  assert.equal(venta.comprobante.intentosEnvioCorreo, 0);
});

test('envío a domicilio: se persiste la dirección junto con la compra confirmada', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const { venta } = await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      metodoEntrega: 'envío a domicilio',
      direccionEntrega: 'Calle Falsa 123, piso 4',
    }),
    usuarioCliente,
  );

  assert.equal(venta.direccionEntrega.direccion, 'Calle Falsa 123, piso 4');
});

// --- Medios de pago deshabilitados (CU-04, ronda de correcciones) ---

test('medio de pago deshabilitado: una compra NUEVA se rechaza, sin crear venta, pago, comprobante ni descontar stock', async () => {
  await MedioPago.update({ habilitado: false }, { where: { nombre: 'Transferencia bancaria (simulada)' } });

  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 409 && /no está disponible/.test(error.message),
  );

  assert.equal(await Venta.count(), 0);
  assert.equal(await Pago.count(), 0);
  assert.equal(await Comprobante.count(), 0);

  const productoFinal = await Producto.findByPk(producto.idProducto);
  assert.equal(productoFinal.stockActual, 5);
});

test('medio de pago deshabilitado DESPUÉS de aprobarse la compra: sigue siendo recuperable (el reintento no vuelve a mirar el medio de pago)', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();
  const datosCompra = armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave });

  const primeraRespuesta = await confirmarCompra(datosCompra, usuarioCliente);
  assert.equal(primeraRespuesta.tipo, 'aprobado');

  await MedioPago.update({ habilitado: false }, { where: { nombre: 'Transferencia bancaria (simulada)' } });

  const segundaRespuesta = await confirmarCompra(datosCompra, usuarioCliente);
  assert.equal(segundaRespuesta.tipo, 'aprobado');
  assert.equal(segundaRespuesta.venta.idVenta, primeraRespuesta.venta.idVenta);
});

test('sembrado no reactiva un medio de pago deshabilitado (buscarOCrear no lo toca si ya existe)', async () => {
  // No ejecuta el script de sembrado en sí (haría falta un proceso aparte);
  // comprueba directamente el contrato que ese script asume: actualizar
  // `habilitado` en una fila EXISTENTE es una operación explícita y
  // separada de crearla, nunca un efecto secundario de "buscar o crear".
  await MedioPago.update({ habilitado: false }, { where: { nombre: 'Transferencia bancaria (simulada)' } });

  const existente = await MedioPago.findOne({ where: { nombre: 'Transferencia bancaria (simulada)' } });
  assert.equal(existente.habilitado, false);

  // "Buscar o crear": como ya existe, no se llega a tocar `habilitado`.
  const encontrada = await MedioPago.findOne({ where: { nombre: 'Transferencia bancaria (simulada)' } });
  assert.ok(encontrada, 'la fila ya existe: buscarOCrear no debe recrearla ni reactivarla');
  assert.equal(encontrada.habilitado, false, 'seguía deshabilitada');
});

// --- Límite del total monetario (CU-04, ronda de correcciones) ---

test('total exactamente en el límite de DECIMAL(10,2) se acepta', async () => {
  const producto = await crearProductoDePrueba({ precio: '99999999.99', stockActual: 1 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];

  const cotizacion = await cotizar(detalles);
  assert.equal(cotizacion.totalCentavos, MAXIMO_IMPORTE_CENTAVOS);
});

test('total apenas por encima del límite de DECIMAL(10,2) se rechaza, tanto al cotizar como al confirmar', async () => {
  // Dos líneas individualmente válidas (cada precio unitario, dentro del
  // límite de su propia columna) que en conjunto superan el máximo del
  // total (reportado: dos líneas de $60.000.000 cada una).
  const productoA = await crearProductoDePrueba({ precio: '60000000.00', stockActual: 2 });
  const productoB = await crearProductoDePrueba({ precio: '60000000.00', stockActual: 2 });
  const detalles = [
    { idProducto: productoA.idProducto, cantidad: 1 },
    { idProducto: productoB.idProducto, cantidad: 1 },
  ];

  await assert.rejects(() => cotizar(detalles), (error) => error.statusCode === 400);

  // También al confirmar: confirmarCompra vuelve a llamar a cotizar() con
  // los mismos `detalles` dentro de la transacción, así que el mismo 400 se
  // dispara ahí, antes de comparar nada contra la cotización aceptada (cuya
  // forma alcanza con que sea válida para pasar la validación de entrada).
  const cotizacionAceptadaCualquiera = aRespuestaPublica(
    await cotizar([{ idProducto: productoA.idProducto, cantidad: 1 }]),
  );
  await assert.rejects(
    () =>
      confirmarCompra(
        armarDatosCompra({ detalles, cotizacionAceptada: cotizacionAceptadaCualquiera }),
        usuarioCliente,
      ),
    (error) => error.statusCode === 400,
  );

  assert.equal(await Venta.count(), 0);
});

test('varias líneas individualmente válidas cuyo total sigue dentro del límite se aceptan sin problema', async () => {
  const productos = await Promise.all(
    Array.from({ length: 3 }, () => crearProductoDePrueba({ precio: '1000.00', stockActual: 10 })),
  );
  const detalles = productos.map((producto) => ({ idProducto: producto.idProducto, cantidad: 2 }));

  const cotizacion = await cotizar(detalles);
  assert.equal(cotizacion.totalCentavos, 600000); // 3 productos x 2 unidades x $1000
});

// --- Contrato transaccional del proveedor de precios (CU-04, §6, ronda de correcciones) ---

test('el proveedor de precios recibe la transacción activa y el MISMO instante de evaluación para todas las líneas', async () => {
  const productoA = await crearProductoDePrueba({ precio: '100.00', stockActual: 10 });
  const productoB = await crearProductoDePrueba({ precio: '200.00', stockActual: 10 });
  const detalles = [
    { idProducto: productoA.idProducto, cantidad: 1 },
    { idProducto: productoB.idProducto, cantidad: 1 },
  ];

  const registroLlamadas = [];
  const proveedorPrecios = crearProveedorPrecioDePrueba(new Map(), registroLlamadas);
  const cotizacion = aRespuestaPublica(await cotizar(detalles, { proveedorPrecios }));

  await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
    { proveedorPrecios },
  );

  // Dos llamadas por la cotización de arriba (sin transacción, fuera de
  // confirmarCompra) + dos por la recotización dentro de confirmarCompra
  // (con transacción) = 4.
  assert.equal(registroLlamadas.length, 4);

  const llamadasConTransaccion = registroLlamadas.filter((r) => r.transaction);
  assert.equal(llamadasConTransaccion.length, 2, 'las dos llamadas de confirmarCompra deben traer la transacción activa');
  assert.equal(
    llamadasConTransaccion[0].transaction,
    llamadasConTransaccion[1].transaction,
    'ambas líneas de la misma confirmación deben compartir la MISMA transacción',
  );

  const llamadasSinTransaccion = registroLlamadas.filter((r) => !r.transaction);
  assert.equal(llamadasSinTransaccion.length, 2, 'las dos llamadas de la cotización de solo lectura no llevan transacción');

  for (const grupo of [llamadasConTransaccion, llamadasSinTransaccion]) {
    assert.ok(grupo[0].instanteEvaluacion instanceof Date);
    assert.equal(
      grupo[0].instanteEvaluacion.getTime(),
      grupo[1].instanteEvaluacion.getTime(),
      'ambas líneas de una misma cotización/confirmación deben evaluarse con el mismo instante',
    );
  }
});

// --- Instantánea histórica del comprador (CU-04, §4, ronda de correcciones) ---

test('editar el nombre/correo del cliente después de comprar no altera el comprobante ya emitido', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion }),
    usuarioCliente,
  );

  // Nombre/apellido por defecto de crearClienteDePrueba (ver ayudaIntegracion.js).
  assert.equal(cliente.nombre, 'Cliente');
  assert.equal(cliente.apellido, 'DePrueba');

  await cliente.update({ nombre: 'Nombre cambiado', apellido: 'Apellido cambiado', email: 'nuevo-correo@petshop.test' });

  const ventaReleida = await obtenerVentaPorId(venta.idVenta, usuarioCliente);
  assert.equal(ventaReleida.comprobante.nombreCompradorHistorico, 'Cliente');
  assert.equal(ventaReleida.comprobante.apellidoCompradorHistorico, 'DePrueba');
  assert.equal(ventaReleida.comprobante.correoCompradorHistorico, 'cliente-cu04@petshop.test');
  assert.notEqual(ventaReleida.comprobante.correoCompradorHistorico, 'nuevo-correo@petshop.test');
});

// --- Recuperación tras perder la respuesta: consultarIntento (CU-04, §1) ---

test('consultarIntento: una compra aprobada se puede consultar por su clave, con el idVenta correcto', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  const { venta } = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave }),
    usuarioCliente,
  );

  const resultado = await consultarIntento(clave, usuarioCliente);
  assert.deepEqual(resultado, { encontrado: true, estado: 'aprobado', idVenta: venta.idVenta });
});

test('consultarIntento: una compra rechazada se puede consultar, con su motivo', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  await confirmarCompra(
    armarDatosCompra({
      detalles,
      cotizacionAceptada: cotizacion,
      claveIdempotencia: clave,
      tipoPagoSimulado: 'debito',
      datosDebito: { ...datosDebitoAprobado, numero: NUMERO_TARJETA_RECHAZADA },
    }),
    usuarioCliente,
  );

  const resultado = await consultarIntento(clave, usuarioCliente);
  assert.equal(resultado.encontrado, true);
  assert.equal(resultado.estado, 'rechazado');
  assert.ok(resultado.motivoRechazo);
});

test('consultarIntento: una clave que nunca existió responde "no encontrado", no un error', async () => {
  const resultado = await consultarIntento(nuevaClave(), usuarioCliente);
  assert.deepEqual(resultado, { encontrado: false });
});

test('consultarIntento: un cliente no puede consultar el intento de otro cliente (aunque conozca la clave exacta)', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();

  await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave }),
    usuarioCliente,
  );

  const otroCliente = await crearClienteDePrueba({ email: 'otro-cliente-consulta@petshop.test' });
  const usuarioAjeno = { idUsuario: 2, rol: 'cliente', idCliente: otroCliente.idCliente };

  const resultado = await consultarIntento(clave, usuarioAjeno);
  assert.deepEqual(resultado, { encontrado: false }, 'la clave de otro cliente no debe ser visible, ni siquiera como "existe pero no es tuya"');
});

test('recuperación con envío a domicilio: reintentar la MISMA clave con la MISMA entrega recupera la venta ya aprobada', async () => {
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 5 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const clave = nuevaClave();
  const entrega = { metodoEntrega: 'envío a domicilio', direccionEntrega: 'Calle Falsa 123, piso 4' };

  const primeraRespuesta = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave, ...entrega }),
    usuarioCliente,
  );

  // Reintento tras "recargar la página": mismo carrito, MISMA entrega
  // (preservada por el frontend, ver claveIdempotencia.js), misma clave.
  const segundaRespuesta = await confirmarCompra(
    armarDatosCompra({ detalles, cotizacionAceptada: cotizacion, claveIdempotencia: clave, ...entrega }),
    usuarioCliente,
  );

  assert.equal(segundaRespuesta.tipo, 'aprobado');
  assert.equal(segundaRespuesta.venta.idVenta, primeraRespuesta.venta.idVenta);
  assert.equal(segundaRespuesta.venta.direccionEntrega.direccion, 'Calle Falsa 123, piso 4');
});
