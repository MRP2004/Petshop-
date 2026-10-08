// Prueba de integración real contra petshop_test. No se ejecuta con `npm test`.
// Ronda 2, Etapa 9: compra mixta (PetShop + dos tiendas), tienda suspendida
// en cotización/compra/venta manual, avisos a vendedores y concurrencia real
// entre suspensión y compra/edición (orden de bloqueos producto → tienda,
// revisado con Codex antes de implementar).
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/database.js';
import Aviso from '../src/models/aviso.model.js';
import Producto from '../src/models/producto.model.js';
import Venta from '../src/models/venta.model.js';
import IntentoCompra from '../src/models/intentoCompra.model.js';
import { cotizar, aRespuestaPublica } from '../src/services/cotizacion.service.js';
import { confirmarCompra } from '../src/services/compra.service.js';
import { registrarVenta } from '../src/services/venta.service.js';
import { actualizarProducto } from '../src/services/producto.service.js';
import { cambiarEstadoTienda, listarVentasDeTienda } from '../src/services/tienda.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearUsuarioDePrueba,
  crearVendedorIndependienteDePrueba,
  crearProductoDePrueba,
  crearMediosPagoSimuladosDePrueba,
  crearMedioPagoDePrueba,
  abrirConexionCruda,
  esperarContencionSobre,
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

const actorDe = (usuario, rol, idTienda = null) => ({
  idUsuario: usuario.idUsuario,
  rol,
  idCliente: usuario.idCliente,
  idTienda,
});

const armarEscenario = async () => {
  const comprador = await crearUsuarioDePrueba();
  const tiendaA = await crearVendedorIndependienteDePrueba({ nombreTienda: 'Tienda A' });
  const tiendaB = await crearVendedorIndependienteDePrueba({ nombreTienda: 'Tienda B' });
  const admin = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });

  const petshop = await crearProductoDePrueba({ nombre: 'Alimento PetShop', precio: '100.00', stockActual: 10 });
  const a1 = await crearProductoDePrueba({ nombre: 'Collar de A', precio: '200.00', stockActual: 5, idTienda: tiendaA.tienda.idTienda });
  const a2 = await crearProductoDePrueba({ nombre: 'Correa de A', precio: '50.00', stockActual: 8, idTienda: tiendaA.tienda.idTienda });
  const b1 = await crearProductoDePrueba({ nombre: 'Cucha de B', precio: '300.00', stockActual: 4, idTienda: tiendaB.tienda.idTienda });

  return {
    comprador,
    compradorActor: actorDe(comprador, 'cliente'),
    tiendaA,
    tiendaB,
    actorA: actorDe(tiendaA.usuario, 'vendedor_independiente', tiendaA.tienda.idTienda),
    actorB: actorDe(tiendaB.usuario, 'vendedor_independiente', tiendaB.tienda.idTienda),
    adminActor: { idUsuario: admin.idUsuario, rol: 'administrador', idCliente: null },
    productos: { petshop, a1, a2, b1 },
  };
};

const comprar = async (detalles, actor, clave = `clave-${Date.now()}-${Math.random()}`) => {
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  return confirmarCompra(
    { claveIdempotencia: clave, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacion },
    actor,
  );
};

// PUT de producto exige el cuerpo completo (mismo contrato que el panel).
const datosEdicion = (nombre) => ({ nombre, precio: '200.00', stockMinimo: 1 });

const avisosDe = (idUsuario) => Aviso.findAll({ where: { idUsuario }, order: [['idAviso', 'ASC']] });
const stockDe = async (producto) => (await Producto.findByPk(producto.idProducto)).stockActual;

test('compra mixta PetShop + 2 tiendas: precio, stock, un aviso por tienda y "Mis ventas" con solo lo propio', async () => {
  const e = await armarEscenario();
  const { petshop, a1, a2, b1 } = e.productos;
  const detalles = [
    { idProducto: petshop.idProducto, cantidad: 1 },
    { idProducto: a1.idProducto, cantidad: 2 },
    { idProducto: a2.idProducto, cantidad: 3 },
    { idProducto: b1.idProducto, cantidad: 1 },
  ];
  const clave = `clave-mixta-${Date.now()}`;

  const resultado = await comprar(detalles, e.compradorActor, clave);

  assert.equal(resultado.tipo, 'aprobado');
  assert.equal(resultado.venta.total, '950.00'); // 100 + 2×200 + 3×50 + 300
  assert.deepEqual(
    [await stockDe(petshop), await stockDe(a1), await stockDe(a2), await stockDe(b1)],
    [9, 3, 5, 3],
  );

  const avisosComprador = await avisosDe(e.comprador.idUsuario);
  assert.deepEqual(avisosComprador.map((a) => a.tipo), ['compra_confirmada']);

  // Dos productos de la tienda A → UN solo aviso para su dueño.
  for (const { usuario } of [e.tiendaA, e.tiendaB]) {
    const avisos = await avisosDe(usuario.idUsuario);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].tipo, 'venta_tienda');
    assert.equal(avisos[0].enlace, '/panel/mis-ventas');
    assert.equal(avisos[0].mensaje, `Nueva venta #${resultado.venta.idVenta} con productos de tu tienda.`);
    assert.doesNotMatch(avisos[0].mensaje, /950|Collar|Correa|Cucha|Alimento/);
  }
  assert.equal(await Aviso.count(), 3, 'nadie más recibe avisos por esta compra');

  const [ventaA] = await listarVentasDeTienda(e.actorA);
  assert.equal(ventaA.subtotalPropio, '550.00');
  assert.deepEqual(ventaA.detallesPropios.map((d) => d.producto.nombre).sort(), ['Collar de A', 'Correa de A']);
  assert.ok(!('total' in ventaA) && !('pago' in ventaA) && !('medioPago' in ventaA));

  const [ventaB] = await listarVentasDeTienda(e.actorB);
  assert.equal(ventaB.subtotalPropio, '300.00');
  assert.deepEqual(ventaB.detallesPropios.map((d) => d.producto.nombre), ['Cucha de B']);

  // Reintento con la misma clave de idempotencia: mismo resultado, sin avisos nuevos.
  const reintento = await comprar(detalles, e.compradorActor, clave);
  assert.equal(reintento.reintento, true);
  assert.equal(reintento.venta.idVenta, resultado.venta.idVenta);
  assert.equal(await Aviso.count(), 3);
  assert.equal(await stockDe(a1), 3);
});

test('tienda suspendida: no se puede cotizar, confirmar ni cargar en una venta manual; nada se descuenta', async () => {
  const e = await armarEscenario();
  const { petshop, a1 } = e.productos;
  const detalles = [
    { idProducto: petshop.idProducto, cantidad: 1 },
    { idProducto: a1.idProducto, cantidad: 1 },
  ];
  // Cotización aceptada ANTES de la suspensión (el carrito del cliente la conserva).
  const cotizacionPrevia = aRespuestaPublica(await cotizar(detalles));

  await cambiarEstadoTienda(e.tiendaA.tienda.idTienda, 'suspendida', e.adminActor);

  await assert.rejects(() => cotizar(detalles), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.codigo, 'PRODUCTO_NO_DISPONIBLE');
    assert.equal(error.message, 'El producto "Collar de A" ya no está disponible para la venta');
    return true;
  });

  await assert.rejects(
    () =>
      confirmarCompra(
        { claveIdempotencia: `clave-susp-${Date.now()}`, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacionPrevia },
        e.compradorActor,
      ),
    (error) => error.statusCode === 409 && error.codigo === 'PRODUCTO_NO_DISPONIBLE',
  );

  const medioManual = await crearMedioPagoDePrueba();
  const personal = await crearUsuarioDePrueba({ rol: 'vendedor', idCliente: null });
  await assert.rejects(
    () =>
      registrarVenta(
        { idCliente: e.comprador.idCliente, idMedioPago: medioManual.idMedioPago, detalles },
        { idUsuario: personal.idUsuario, rol: 'vendedor', idCliente: null },
      ),
    (error) => error.statusCode === 409 && error.codigo === 'PRODUCTO_NO_DISPONIBLE',
  );

  assert.equal(await stockDe(petshop), 10);
  assert.equal(await stockDe(a1), 5);
  assert.equal(await Venta.count(), 0);
  assert.equal(await IntentoCompra.count(), 0, 'el intento se revierte con la transacción: la clave queda libre');
  assert.equal(await Aviso.count(), 0);

  // Reactivada, la misma compra vuelve a funcionar.
  await cambiarEstadoTienda(e.tiendaA.tienda.idTienda, 'activa', e.adminActor);
  assert.equal((await comprar(detalles, e.compradorActor)).tipo, 'aprobado');
});

test('venta manual del personal con productos de una tienda: aviso solo a su dueño', async () => {
  const e = await armarEscenario();
  const medioManual = await crearMedioPagoDePrueba();
  const personal = await crearUsuarioDePrueba({ rol: 'vendedor', idCliente: null });

  const venta = await registrarVenta(
    {
      idCliente: e.comprador.idCliente,
      idMedioPago: medioManual.idMedioPago,
      detalles: [
        { idProducto: e.productos.b1.idProducto, cantidad: 1 },
        { idProducto: e.productos.petshop.idProducto, cantidad: 2 },
      ],
    },
    { idUsuario: personal.idUsuario, rol: 'vendedor', idCliente: null },
  );

  const avisosB = await avisosDe(e.tiendaB.usuario.idUsuario);
  assert.equal(avisosB.length, 1);
  assert.equal(avisosB[0].mensaje, `Nueva venta #${venta.idVenta} con productos de tu tienda.`);
  assert.equal((await avisosDe(e.tiendaA.usuario.idUsuario)).length, 0);
});

test('reintento idempotente de una compra ya aprobada, después de suspender la tienda: devuelve la venta guardada, sin avisos nuevos', async () => {
  const e = await armarEscenario();
  const detalles = [{ idProducto: e.productos.a1.idProducto, cantidad: 1 }];
  const clave = `clave-reintento-${Date.now()}`;
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const cuerpo = { claveIdempotencia: clave, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacion };

  const original = await confirmarCompra(cuerpo, e.compradorActor);
  await cambiarEstadoTienda(e.tiendaA.tienda.idTienda, 'suspendida', e.adminActor);
  const avisosAntes = await Aviso.count();

  const reintento = await confirmarCompra(cuerpo, e.compradorActor);

  assert.equal(reintento.tipo, 'aprobado');
  assert.equal(reintento.reintento, true);
  assert.equal(reintento.venta.idVenta, original.venta.idVenta);
  assert.equal(await Aviso.count(), avisosAntes);
});

// --- Concurrencia real (bloqueos de MySQL, no Promise.all a ciegas) ---

test('concurrencia: una suspensión en curso (X sobre la tienda) hace esperar a la compra, que luego ve "suspendida" y no descuenta stock', async () => {
  const e = await armarEscenario();
  const detalles = [{ idProducto: e.productos.a1.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const conexion = await abrirConexionCruda();
  try {
    await conexion.beginTransaction();
    await conexion.query('SELECT idTienda FROM tienda WHERE idTienda = ? FOR UPDATE', [e.tiendaA.tienda.idTienda]);
    const [[{ id: idConexion }]] = await conexion.query('SELECT CONNECTION_ID() AS id');

    const compra = confirmarCompra(
      { claveIdempotencia: `clave-carrera-${Date.now()}`, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacion },
      e.compradorActor,
    ).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    );

    assert.equal(await esperarContencionSobre(idConexion), true, 'la compra debía quedar esperando el bloqueo de la tienda');

    await conexion.query("UPDATE tienda SET estado = 'suspendida' WHERE idTienda = ?", [e.tiendaA.tienda.idTienda]);
    await conexion.commit();

    const resultado = await compra;
    assert.equal(resultado.ok, false);
    assert.equal(resultado.error.codigo, 'PRODUCTO_NO_DISPONIBLE');
  } finally {
    await conexion.end();
  }

  assert.equal(await stockDe(e.productos.a1), 5);
  assert.equal(await Venta.count(), 0);
});

test('concurrencia: una compra en curso (FOR SHARE sobre la tienda) hace esperar a la suspensión hasta que termina', async () => {
  const e = await armarEscenario();

  const conexion = await abrirConexionCruda();
  try {
    await conexion.beginTransaction();
    await conexion.query('SELECT idTienda FROM tienda WHERE idTienda = ? FOR SHARE', [e.tiendaA.tienda.idTienda]);
    const [[{ id: idConexion }]] = await conexion.query('SELECT CONNECTION_ID() AS id');

    let suspendida = false;
    const suspension = cambiarEstadoTienda(e.tiendaA.tienda.idTienda, 'suspendida', e.adminActor).then(() => {
      suspendida = true;
    });

    assert.equal(await esperarContencionSobre(idConexion), true, 'la suspensión debía esperar a la compra en curso');
    assert.equal(suspendida, false);

    await conexion.commit();
    await suspension;
    assert.equal(suspendida, true);
  } finally {
    await conexion.end();
  }
});

test('concurrencia: editar un producto propio bloquea primero el PRODUCTO y recién después la tienda (orden producto → tienda)', async () => {
  const e = await armarEscenario();
  const { a1 } = e.productos;

  // Simula una compra en curso que ya bloqueó el producto.
  const conexionCompra = await abrirConexionCruda();
  const conexionSonda = await abrirConexionCruda();
  try {
    await conexionCompra.beginTransaction();
    await conexionCompra.query('SELECT idProducto FROM producto WHERE idProducto = ? FOR UPDATE', [a1.idProducto]);
    const [[{ id: idConexion }]] = await conexionCompra.query('SELECT CONNECTION_ID() AS id');

    const edicion = actualizarProducto(a1.idProducto, datosEdicion('Collar de A editado'), e.actorA);

    assert.equal(await esperarContencionSobre(idConexion), true, 'la edición debía esperar el bloqueo del producto');

    // Mientras la edición espera el producto, NO tiene tomada la tienda:
    // la sonda puede bloquearla sin esperar (NOWAIT falla si estuviera tomada).
    await conexionSonda.beginTransaction();
    await conexionSonda.query('SELECT idTienda FROM tienda WHERE idTienda = ? FOR UPDATE NOWAIT', [e.tiendaA.tienda.idTienda]);
    await conexionSonda.commit();

    await conexionCompra.commit();
    await edicion;
  } finally {
    await conexionCompra.end();
    await conexionSonda.end();
  }

  assert.equal((await Producto.findByPk(a1.idProducto)).nombre, 'Collar de A editado');
});

test('concurrencia: una suspensión que commitea mientras el vendedor edita hace fallar la edición (403), sin cambios', async () => {
  const e = await armarEscenario();
  const { a1 } = e.productos;

  const conexion = await abrirConexionCruda();
  try {
    await conexion.beginTransaction();
    await conexion.query('SELECT idTienda FROM tienda WHERE idTienda = ? FOR UPDATE', [e.tiendaA.tienda.idTienda]);
    const [[{ id: idConexion }]] = await conexion.query('SELECT CONNECTION_ID() AS id');

    const edicion = actualizarProducto(a1.idProducto, datosEdicion('No debería guardarse'), e.actorA).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    );

    assert.equal(await esperarContencionSobre(idConexion), true);
    await conexion.query("UPDATE tienda SET estado = 'suspendida' WHERE idTienda = ?", [e.tiendaA.tienda.idTienda]);
    await conexion.commit();

    const resultado = await edicion;
    assert.equal(resultado.ok, false);
    assert.equal(resultado.error.statusCode, 403);
  } finally {
    await conexion.end();
  }

  assert.equal((await Producto.findByPk(a1.idProducto)).nombre, 'Collar de A');
});
