// Prueba de integración real contra petshop_test. No se ejecuta con `npm test`.
// Ronda 2, Etapa 9: permisos cruzados por HTTP entre cliente, vendedor
// interno, administrador y dos vendedores independientes (tiendas A y B).
// Cada rol inicia sesión con el login REAL (POST /api/usuarios/login) y usa
// la cookie de sesión + X-CSRF-Token, igual que el navegador — nada de
// tokens firmados a mano. Los datos se siembran una sola vez (before): cada
// prueba no depende del orden de las demás.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import sequelize from '../src/config/database.js';
import app from '../src/app.js';
import Producto from '../src/models/producto.model.js';
import { registrarVenta } from '../src/services/venta.service.js';
import {
  prepararEsquema,
  limpiarDatos,
  crearUsuarioDePrueba,
  crearVendedorIndependienteDePrueba,
  crearProductoDePrueba,
  crearMedioPagoDePrueba,
} from './ayudaIntegracion.js';

const PASSWORD = 'ClaveDePrueba123';
const sesiones = {};
const datos = {};

const iniciarSesion = async (usuario) => {
  const agente = request.agent(app);
  const { body } = await agente
    .post('/api/usuarios/login')
    .send({ email: usuario.email, password: PASSWORD })
    .expect(200);
  const conCsrf = (solicitud) => solicitud.set('X-CSRF-Token', body.csrfToken);
  return {
    get: (url) => agente.get(url),
    post: (url, cuerpo) => conCsrf(agente.post(url)).send(cuerpo),
    put: (url, cuerpo) => conCsrf(agente.put(url)).send(cuerpo),
    patch: (url, cuerpo) => conCsrf(agente.patch(url)).send(cuerpo),
    delete: (url) => conCsrf(agente.delete(url)),
    usuario: body.usuario,
  };
};

const cuerpoProducto = (nombre) => ({ nombre, precio: '150.00', stockMinimo: 1 });

before(async () => {
  await prepararEsquema();
  await limpiarDatos();

  const cliente = await crearUsuarioDePrueba();
  const vendedor = await crearUsuarioDePrueba({ rol: 'vendedor', idCliente: null });
  const administrador = await crearUsuarioDePrueba({ rol: 'administrador', idCliente: null });
  const tiendaA = await crearVendedorIndependienteDePrueba({ nombreTienda: 'Tienda A' });
  const tiendaB = await crearVendedorIndependienteDePrueba({ nombreTienda: 'Tienda B' });

  datos.tiendaA = tiendaA.tienda;
  datos.tiendaB = tiendaB.tienda;
  datos.productoPetshop = await crearProductoDePrueba({ nombre: 'Producto PetShop' });
  datos.productoA = await crearProductoDePrueba({ nombre: 'Producto A', idTienda: tiendaA.tienda.idTienda });
  datos.productoB = await crearProductoDePrueba({ nombre: 'Producto B', idTienda: tiendaB.tienda.idTienda });

  // Venta con SOLO un producto de B, comprada por el cliente.
  const medio = await crearMedioPagoDePrueba();
  const ventaB = await registrarVenta(
    { idCliente: cliente.idCliente, idMedioPago: medio.idMedioPago, detalles: [{ idProducto: datos.productoB.idProducto, cantidad: 1 }] },
    { idUsuario: vendedor.idUsuario, rol: 'vendedor', idCliente: null },
  );
  datos.idVentaB = ventaB.idVenta;

  sesiones.cliente = await iniciarSesion(cliente);
  sesiones.vendedor = await iniciarSesion(vendedor);
  sesiones.administrador = await iniciarSesion(administrador);
  sesiones.vendedorA = await iniciarSesion(tiendaA.usuario);
  sesiones.vendedorB = await iniciarSesion(tiendaB.usuario);
});

after(async () => {
  await sequelize.close();
});

test('el login real de un vendedor independiente devuelve su idTienda y conserva su idCliente', () => {
  assert.equal(sesiones.vendedorA.usuario.rol, 'vendedor_independiente');
  assert.equal(sesiones.vendedorA.usuario.idTienda, datos.tiendaA.idTienda);
  assert.ok(sesiones.vendedorA.usuario.idCliente);
});

test('crear producto: el cliente no puede; el vendedor independiente siempre crea en SU tienda aunque mande otro idTienda', async () => {
  await sesiones.cliente.post('/api/productos', { ...cuerpoProducto('Del cliente'), stockActual: 3 }).expect(403);

  const { body } = await sesiones.vendedorA
    .post('/api/productos', { ...cuerpoProducto('Nuevo de A'), stockActual: 3, idTienda: datos.tiendaB.idTienda })
    .expect(201);
  assert.equal(body.idTienda, datos.tiendaA.idTienda);

  const { body: interno } = await sesiones.vendedor.post('/api/productos', { ...cuerpoProducto('Nuevo interno'), stockActual: 3 }).expect(201);
  assert.equal(interno.idTienda, null);
});

test('editar, borrar y ajustar stock de productos AJENOS: 403 para el vendedor independiente, sin cambios', async () => {
  const { productoPetshop, productoB } = datos;

  for (const producto of [productoPetshop, productoB]) {
    await sesiones.vendedorA.put(`/api/productos/${producto.idProducto}`, cuerpoProducto('Hackeado')).expect(403);
    await sesiones.vendedorA.patch(`/api/productos/${producto.idProducto}/stock`, { cantidad: -5 }).expect(403);
    await sesiones.vendedorA.delete(`/api/productos/${producto.idProducto}`).expect(403);
  }

  const [petshop, b] = await Promise.all([
    Producto.findByPk(productoPetshop.idProducto),
    Producto.findByPk(productoB.idProducto),
  ]);
  assert.equal(petshop.nombre, 'Producto PetShop');
  assert.equal(b.nombre, 'Producto B');
  assert.equal(b.stockActual, 9, 'solo la venta sembrada descontó 1');
});

test('editar y ajustar stock del producto PROPIO: permitido para su dueño; 403 para la otra tienda y para el cliente', async () => {
  const url = `/api/productos/${datos.productoA.idProducto}`;

  await sesiones.vendedorB.put(url, cuerpoProducto('Editado por B')).expect(403);
  await sesiones.cliente.put(url, cuerpoProducto('Editado por cliente')).expect(403);

  await sesiones.vendedorA.put(url, cuerpoProducto('Producto A editado')).expect(200);
  await sesiones.vendedorA.patch(`${url}/stock`, { cantidad: 2 }).expect(200);

  const actualizado = await Producto.findByPk(datos.productoA.idProducto);
  assert.equal(actualizado.nombre, 'Producto A editado');
  assert.equal(actualizado.stockActual, 12);
});

test('"Mis ventas": cada tienda ve solo las ventas con sus productos; la venta de B no existe para A', async () => {
  const url = `/api/tiendas/propia/ventas/${datos.idVentaB}`;

  await sesiones.vendedorA.get(url).expect(404);
  const { body } = await sesiones.vendedorB.get(url).expect(200);
  assert.equal(body.subtotalPropio, '100.00');
  assert.ok(!('total' in body));

  const { body: listaA } = await sesiones.vendedorA.get('/api/tiendas/propia/ventas').expect(200);
  assert.deepEqual(listaA, []);

  for (const rol of ['cliente', 'vendedor', 'administrador']) {
    await sesiones[rol].get('/api/tiendas/propia/ventas').expect(403);
  }
});

test('la venta completa (total, pago, otros vendedores) no es accesible para un vendedor independiente que no la compró', async () => {
  await sesiones.vendedorB.get(`/api/ventas/${datos.idVentaB}`).expect(403);
  await sesiones.vendedorB.get(`/api/ventas/${datos.idVentaB}/comprobante/pdf`).expect(403);

  const { body } = await sesiones.vendedorB.get('/api/ventas').expect(200);
  assert.deepEqual(body, [], 'como comprador no tiene compras propias');
});

test('gestión del pedido completo: exclusiva del personal interno (el vendedor independiente solo consulta)', async () => {
  const base = `/api/ventas/${datos.idVentaB}`;
  for (const accion of ['enviar', 'entregar', 'cancelar']) {
    await sesiones.vendedorB.patch(`${base}/${accion}`, {}).expect(403);
    await sesiones.cliente.patch(`${base}/${accion}`, {}).expect(403);
  }
  await sesiones.vendedorA
    .post('/api/ventas', { idCliente: 1, idMedioPago: 1, detalles: [{ idProducto: datos.productoA.idProducto, cantidad: 1 }] })
    .expect(403);
});

test('administración de tiendas y solicitudes: solo el administrador', async () => {
  for (const rol of ['cliente', 'vendedor', 'vendedorA']) {
    await sesiones[rol].get('/api/tiendas').expect(403);
    await sesiones[rol].get('/api/solicitudes-vendedor').expect(403);
    await sesiones[rol].patch(`/api/tiendas/${datos.tiendaA.idTienda}/estado`, { estado: 'activa' }).expect(403);
  }
  // Un vendedor independiente no puede suspender a la competencia ni reactivar la propia.
  await sesiones.vendedorA.patch(`/api/tiendas/${datos.tiendaB.idTienda}/estado`, { estado: 'suspendida' }).expect(403);

  await sesiones.administrador.get('/api/tiendas').expect(200);
  await sesiones.administrador.get('/api/solicitudes-vendedor').expect(200);
});

test('"Quiero ser vendedor" y "mi tienda": cada ruta solo para su rol', async () => {
  const solicitud = { nombreTienda: 'Otra', tipoDocumento: 'CUIL', numeroDocumento: '20-17254359-7' };
  await sesiones.vendedorA.post('/api/solicitudes-vendedor', solicitud).expect(403);
  await sesiones.vendedor.post('/api/solicitudes-vendedor', solicitud).expect(403);

  for (const rol of ['cliente', 'vendedor', 'administrador']) {
    await sesiones[rol].get('/api/tiendas/propia').expect(403);
    await sesiones[rol].get('/api/tiendas/propia/productos').expect(403);
  }

  const { body } = await sesiones.vendedorA.get('/api/tiendas/propia/productos').expect(200);
  assert.ok(body.every((p) => p.idTienda === datos.tiendaA.idTienda));
});

test('stock bajo: el vendedor independiente solo ve el de su tienda', async () => {
  await Producto.update({ stockActual: 0 }, { where: {} });

  const { body: deA } = await sesiones.vendedorA.get('/api/productos/stock-bajo').expect(200);
  assert.ok(deA.length > 0);
  assert.ok(deA.every((p) => p.idTienda === datos.tiendaA.idTienda));

  const { body: interno } = await sesiones.vendedor.get('/api/productos/stock-bajo').expect(200);
  assert.ok(interno.some((p) => p.idTienda === null) && interno.some((p) => p.idTienda === datos.tiendaB.idTienda));

  await sesiones.cliente.get('/api/productos/stock-bajo').expect(403);
});

test('sin sesión: todas las rutas de marketplace responden 401', async () => {
  for (const url of ['/api/tiendas/propia', '/api/tiendas/propia/ventas', '/api/tiendas', '/api/solicitudes-vendedor']) {
    await request(app).get(url).expect(401);
  }
  await request(app).put(`/api/productos/${datos.productoA.idProducto}`).send(cuerpoProducto('x')).expect(401);
});
