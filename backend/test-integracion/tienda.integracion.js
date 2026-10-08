// Prueba de integración real contra petshop_test. No se ejecuta con `npm test`.
// Marketplace: vendedores independientes (ronda 2, Etapa 8) — diseño de
// esquema y autorización revisado con Codex ANTES de escribir el modelo o
// la migración (ver docs/estado-proyecto.md).
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import Usuario from '../src/models/usuario.model.js';
import Tienda from '../src/models/tienda.model.js';
import SolicitudVendedor from '../src/models/solicitudVendedor.model.js';
import Producto from '../src/models/producto.model.js';
import {
  solicitarSerVendedor,
  resolverSolicitudVendedor,
  listarVentasDeTienda,
  obtenerVentaDeTiendaPorId,
  cambiarEstadoTienda,
} from '../src/services/tienda.service.js';
import { crearProducto, actualizarProducto, ajustarStockProducto, obtenerProductos } from '../src/services/producto.service.js';
import { confirmarCompra } from '../src/services/compra.service.js';
import { cotizar, aRespuestaPublica } from '../src/services/cotizacion.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearClienteDePrueba,
  crearUsuarioDePrueba,
  crearVendedorIndependienteDePrueba,
  crearProductoDePrueba,
  crearMediosPagoSimuladosDePrueba,
} from './ayudaIntegracion.js';

const CUIL_REAL = '20-17254359-7'; // ver test/validacionFiscal.test.js
const CUIL_REAL_B = '20172543597'; // mismo número, sin separadores — se usa en otra cuenta

before(async () => {
  await prepararEsquema();
});

beforeEach(async () => {
  await limpiarDatos();
});

after(async () => {
  await sequelize.close();
});

test('solicitarSerVendedor valida CUIL/CUIT real y rechaza una solicitud pendiente duplicada', async () => {
  const cliente = await crearUsuarioDePrueba();
  const usuarioActor = { idUsuario: cliente.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };

  await assert.rejects(
    () => solicitarSerVendedor({ nombreTienda: 'Mi Tienda', tipoDocumento: 'CUIL', numeroDocumento: '123' }, usuarioActor),
    (error) => error.statusCode === 400,
  );

  await solicitarSerVendedor(
    { nombreTienda: 'Mi Tienda', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL },
    usuarioActor,
  );

  const cantidad = await SolicitudVendedor.count({ where: { idUsuario: cliente.idUsuario } });
  assert.equal(cantidad, 1);

  await assert.rejects(
    () => solicitarSerVendedor({ nombreTienda: 'Otra', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL }, usuarioActor),
    (error) => error.statusCode === 409,
  );
});

// Hallazgo real de Codex (revisión de la implementación): dos solicitudes
// concurrentes del mismo cliente podían pasar las dos el chequeo de
// "solicitud pendiente" antes de que cualquiera insertara la suya. El
// bloqueo de la fila de Usuario (ver tienda.service.js#solicitarSerVendedor)
// serializa esto — con `Promise.allSettled`, la segunda debe rechazarse.
test('concurrencia real: dos solicitudes al mismo tiempo del mismo cliente, solo una queda pendiente', async () => {
  const cliente = await crearUsuarioDePrueba();
  const usuarioActor = { idUsuario: cliente.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };

  const resultados = await Promise.allSettled([
    solicitarSerVendedor({ nombreTienda: 'Tienda A', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL }, usuarioActor),
    solicitarSerVendedor({ nombreTienda: 'Tienda B', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL_B }, usuarioActor),
  ]);

  const exitosas = resultados.filter((r) => r.status === 'fulfilled');
  const rechazadas = resultados.filter((r) => r.status === 'rejected');
  assert.equal(exitosas.length, 1, 'exactamente una de las dos debía tener éxito');
  assert.equal(rechazadas.length, 1);
  assert.equal(rechazadas[0].reason.statusCode, 409);

  const cantidad = await SolicitudVendedor.count({ where: { idUsuario: cliente.idUsuario } });
  assert.equal(cantidad, 1, 'no debía quedar más de una solicitud pendiente para la misma cuenta');
});

test('un vendedor independiente no puede fijar idProveedor (se fuerza a null, ni siquiera se valida)', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda };

  const producto = await crearProducto(
    { nombre: 'Producto con proveedor inventado', precio: '40.00', stockActual: 5, stockMinimo: 1, idProveedor: 999999 },
    usuarioActor,
  );

  assert.equal(producto.idProveedor, null);
});

test('resolverSolicitudVendedor (aprobar): crea la Tienda y cambia el rol, todo o nada; una segunda aprobación se rechaza', async () => {
  const cliente = await crearUsuarioDePrueba();
  const usuarioActor = { idUsuario: cliente.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };
  const cuentaAdmin = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  const administrador = { idUsuario: cuentaAdmin.idUsuario, rol: 'administrador', idCliente: null };

  await solicitarSerVendedor(
    { nombreTienda: 'Tienda de Ana', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL },
    usuarioActor,
  );
  const solicitud = await SolicitudVendedor.findOne({ where: { idUsuario: cliente.idUsuario } });

  await resolverSolicitudVendedor(solicitud.idSolicitud, 'aprobar', administrador);

  const usuarioActualizado = await Usuario.findByPk(cliente.idUsuario);
  assert.equal(usuarioActualizado.rol, 'vendedor_independiente');
  // Conserva idCliente (hallazgo real de Codex, ver docs/estado-proyecto.md):
  // sigue siendo comprador, no se pierde su identidad de cliente.
  assert.equal(usuarioActualizado.idCliente, cliente.idCliente);

  const tienda = await Tienda.findOne({ where: { idUsuario: cliente.idUsuario } });
  assert.ok(tienda, 'debía crearse la Tienda');
  assert.equal(tienda.nombre, 'Tienda de Ana');
  assert.equal(tienda.estado, 'activa');

  await assert.rejects(
    () => resolverSolicitudVendedor(solicitud.idSolicitud, 'aprobar', administrador),
    (error) => error.statusCode === 409,
  );
});

test('resolverSolicitudVendedor (rechazar): no crea tienda ni cambia el rol', async () => {
  const cliente = await crearUsuarioDePrueba();
  const usuarioActor = { idUsuario: cliente.idUsuario, rol: 'cliente', idCliente: cliente.idCliente };
  const cuentaAdmin = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  const administrador = { idUsuario: cuentaAdmin.idUsuario, rol: 'administrador', idCliente: null };

  await solicitarSerVendedor(
    { nombreTienda: 'Tienda rechazada', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL },
    usuarioActor,
  );
  const solicitud = await SolicitudVendedor.findOne({ where: { idUsuario: cliente.idUsuario } });

  await resolverSolicitudVendedor(solicitud.idSolicitud, 'rechazar', administrador, 'Documentación insuficiente');

  const usuarioActualizado = await Usuario.findByPk(cliente.idUsuario);
  assert.equal(usuarioActualizado.rol, 'cliente');
  assert.equal(await Tienda.count({ where: { idUsuario: cliente.idUsuario } }), 0);

  const solicitudFinal = await SolicitudVendedor.findByPk(solicitud.idSolicitud);
  assert.equal(solicitudFinal.estado, 'rechazada');
  assert.equal(solicitudFinal.motivoRechazo, 'Documentación insuficiente');
});

test('crearProducto de un vendedor independiente fuerza idTienda propio (ignora cualquier valor del cuerpo)', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  const otraTienda = await crearVendedorIndependienteDePrueba();
  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda };

  const producto = await crearProducto(
    { nombre: 'Correa para perro', precio: '50.00', stockActual: 5, stockMinimo: 1, idTienda: otraTienda.tienda.idTienda },
    usuarioActor,
  );

  assert.equal(producto.idTienda, tienda.idTienda, 'debía ignorar el idTienda del cuerpo y usar el propio');
});

test('un vendedor independiente NO puede editar/eliminar/ajustar stock de un producto de PetShop ni de otra tienda', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda };

  const productoPetshop = await crearProductoDePrueba({ nombre: 'Producto de PetShop' });
  const otroVendedor = await crearVendedorIndependienteDePrueba();
  const productoAjeno = await crearProducto(
    { nombre: 'Producto ajeno', precio: '20.00', stockActual: 3, stockMinimo: 1 },
    { idUsuario: otroVendedor.usuario.idUsuario, rol: 'vendedor_independiente', idCliente: otroVendedor.usuario.idCliente, idTienda: otroVendedor.tienda.idTienda },
  );

  for (const productoAjenoOPetshop of [productoPetshop, productoAjeno]) {
    await assert.rejects(
      () => actualizarProducto(productoAjenoOPetshop.idProducto, { nombre: 'Hackeado', precio: '1.00', stockMinimo: 1 }, usuarioActor),
      (error) => error.statusCode === 403,
    );
    await assert.rejects(
      () => ajustarStockProducto(productoAjenoOPetshop.idProducto, { cantidad: 1 }, usuarioActor),
      (error) => error.statusCode === 403,
    );
  }
});

test('una tienda suspendida no puede escribir sus propios productos; sus productos desaparecen del catálogo público', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda };
  const administrador = { idUsuario: 900, rol: 'administrador', idCliente: null };

  const producto = await crearProducto(
    { nombre: 'Juguete de tienda suspendida', precio: '30.00', stockActual: 5, stockMinimo: 1 },
    usuarioActor,
  );

  const catalogoAntes = await obtenerProductos({});
  assert.ok(catalogoAntes.some((p) => p.idProducto === producto.idProducto));

  await cambiarEstadoTienda(tienda.idTienda, 'suspendida', administrador);

  await assert.rejects(
    () => actualizarProducto(producto.idProducto, { nombre: 'Nuevo nombre', precio: '30.00', stockMinimo: 1 }, usuarioActor),
    (error) => error.statusCode === 403,
  );

  const catalogoDespues = await obtenerProductos({});
  assert.ok(
    !catalogoDespues.some((p) => p.idProducto === producto.idProducto),
    'un producto de una tienda suspendida no debe verse en el catálogo público',
  );
});

test('un vendedor independiente sigue siendo comprador: confirma una compra real y aparece en sus propias compras', async () => {
  const { usuario } = await crearVendedorIndependienteDePrueba();
  await crearMediosPagoSimuladosDePrueba();
  const producto = await crearProductoDePrueba({ precio: '500.00', stockActual: 10 });
  const detalles = [{ idProducto: producto.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente };
  const resultado = await confirmarCompra(
    { claveIdempotencia: `clave-${Date.now()}`, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacion },
    usuarioActor,
  );

  assert.equal(resultado.tipo, 'aprobado');
  assert.equal(resultado.venta.idCliente, usuario.idCliente);
});

test('"Mis ventas" de un vendedor independiente: solo sus propias líneas, nunca el total/pago/comprobante/dirección de la venta completa', async () => {
  const { usuario, tienda } = await crearVendedorIndependienteDePrueba();
  const usuarioActor = { idUsuario: usuario.idUsuario, rol: 'vendedor_independiente', idCliente: usuario.idCliente, idTienda: tienda.idTienda };

  const productoTienda = await crearProducto(
    { nombre: 'Collar de tienda', precio: '200.00', stockActual: 10, stockMinimo: 1 },
    usuarioActor,
  );
  const productoPetshop = await crearProductoDePrueba({ nombre: 'Alimento PetShop', precio: '300.00', stockActual: 10 });

  const comprador = await crearUsuarioDePrueba();
  await crearMediosPagoSimuladosDePrueba();

  const detalles = [
    { idProducto: productoTienda.idProducto, cantidad: 2 },
    { idProducto: productoPetshop.idProducto, cantidad: 1 },
  ];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));
  const compradorActor = { idUsuario: comprador.idUsuario, rol: 'cliente', idCliente: comprador.idCliente };

  const resultado = await confirmarCompra(
    { claveIdempotencia: `clave-${Date.now()}`, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacion },
    compradorActor,
  );

  const ventasDeTienda = await listarVentasDeTienda(usuarioActor);
  assert.equal(ventasDeTienda.length, 1);
  const ventaDto = ventasDeTienda[0];

  assert.equal(ventaDto.idVenta, resultado.venta.idVenta);
  assert.equal(ventaDto.detallesPropios.length, 1, 'solo la línea del producto de esta tienda');
  assert.equal(ventaDto.detallesPropios[0].producto.idProducto, productoTienda.idProducto);
  assert.equal(ventaDto.subtotalPropio, '400.00'); // 200.00 * 2

  // El DTO nunca debe traer estos campos — verificación explícita, no solo
  // "no rompió": si algún día alguien agrega `...venta` por accidente, esto
  // lo detecta.
  assert.equal(ventaDto.total, undefined);
  assert.equal(ventaDto.descuento, undefined);
  assert.equal(ventaDto.medioPago, undefined);
  assert.equal(ventaDto.pago, undefined);
  assert.equal(ventaDto.comprobante, undefined);
  assert.equal(ventaDto.direccionEntrega, undefined);
  assert.equal(ventaDto.solicitudesCancelacion, undefined);

  const ventaPorId = await obtenerVentaDeTiendaPorId(resultado.venta.idVenta, usuarioActor);
  assert.equal(ventaPorId.detallesPropios.length, 1);
});

test('un vendedor independiente no ve ventas que no contengan ningún producto suyo', async () => {
  const { usuario: vendedorSinVentas, tienda } = await crearVendedorIndependienteDePrueba();
  const usuarioActorSinVentas = { idUsuario: vendedorSinVentas.idUsuario, rol: 'vendedor_independiente', idCliente: vendedorSinVentas.idCliente, idTienda: tienda.idTienda };

  const comprador = await crearUsuarioDePrueba();
  await crearMediosPagoSimuladosDePrueba();
  const productoPetshop = await crearProductoDePrueba({ precio: '100.00', stockActual: 10 });
  const detalles = [{ idProducto: productoPetshop.idProducto, cantidad: 1 }];
  const cotizacion = aRespuestaPublica(await cotizar(detalles));

  const resultado = await confirmarCompra(
    { claveIdempotencia: `clave-${Date.now()}`, detalles, tipoPagoSimulado: 'transferencia', cotizacionAceptada: cotizacion },
    { idUsuario: comprador.idUsuario, rol: 'cliente', idCliente: comprador.idCliente },
  );

  assert.deepEqual(await listarVentasDeTienda(usuarioActorSinVentas), []);
  await assert.rejects(
    () => obtenerVentaDeTiendaPorId(resultado.venta.idVenta, usuarioActorSinVentas),
    (error) => error.statusCode === 404,
  );
});

test('camino HTTP completo: solicitar, aprobar, crear producto propio, ver "mis ventas"', async () => {
  const cliente = await crearClienteDePrueba();
  const usuarioLogin = await crearUsuarioDePrueba({ idCliente: cliente.idCliente, password: 'ClaveDePrueba123' });
  const admin = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null, password: 'ClaveDePrueba123' });

  const agenteCliente = request.agent(app);
  const { body: sesionCliente } = await agenteCliente
    .post('/api/usuarios/login')
    .send({ email: usuarioLogin.email, password: 'ClaveDePrueba123' })
    .expect(200);

  await agenteCliente
    .post('/api/solicitudes-vendedor')
    .set('X-CSRF-Token', sesionCliente.csrfToken)
    .send({ nombreTienda: 'Tienda HTTP', tipoDocumento: 'CUIL', numeroDocumento: CUIL_REAL })
    .expect(201);

  const agenteAdmin = request.agent(app);
  const { body: sesionAdmin } = await agenteAdmin
    .post('/api/usuarios/login')
    .send({ email: admin.email, password: 'ClaveDePrueba123' })
    .expect(200);

  const { body: solicitudes } = await agenteAdmin.get('/api/solicitudes-vendedor').expect(200);
  assert.equal(solicitudes.length, 1);

  await agenteAdmin
    .patch(`/api/solicitudes-vendedor/${solicitudes[0].idSolicitud}/aprobar`)
    .set('X-CSRF-Token', sesionAdmin.csrfToken)
    .expect(204);

  // La sesión vieja del cliente quedó con el rol viejo en el JWT (8h de
  // vigencia) — inicia sesión de nuevo para obtener un token con el rol
  // actualizado, tal como pasaría en la app real (el frontend no puede
  // "refrescar" un JWT ya emitido).
  const agenteVendedor = request.agent(app);
  const { body: sesionVendedor } = await agenteVendedor
    .post('/api/usuarios/login')
    .send({ email: usuarioLogin.email, password: 'ClaveDePrueba123' })
    .expect(200);
  assert.equal(sesionVendedor.usuario.rol, 'vendedor_independiente');
  assert.ok(sesionVendedor.usuario.idTienda);

  await agenteVendedor
    .post('/api/productos')
    .set('X-CSRF-Token', sesionVendedor.csrfToken)
    .send({ nombre: 'Producto HTTP', precio: '75.00', stockActual: 4, stockMinimo: 1 })
    .expect(201);

  const { body: misProductos } = await agenteVendedor.get('/api/tiendas/propia/productos').expect(200);
  assert.equal(misProductos.length, 1);
  assert.equal(misProductos[0].nombre, 'Producto HTTP');

  const { body: misVentas } = await agenteVendedor.get('/api/tiendas/propia/ventas').expect(200);
  assert.deepEqual(misVentas, []);
});
