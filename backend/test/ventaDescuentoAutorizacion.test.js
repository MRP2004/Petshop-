// Prueba de regresión para el hallazgo crítico de la revisión: un cliente
// autenticado podía mandar `descuento` (o `minimoMayorista`) en el cuerpo
// de POST /api/ventas y el backend lo aplicaba igual, llevando el total a
// valores arbitrarios (incluso 0). La corrección está en venta.service.js
// (registrarVenta ignora esos dos campos cuando usuario.rol === 'cliente').
//
// Corrección posterior (revisión de Codex sobre el diff de CU-04): la ruta
// POST /api/ventas pasó a ser exclusiva del personal (ver
// routes/venta.routes.js) — un cliente que la llamaba directamente se
// salteaba el checkout con pago simulado por completo. Los casos de acá
// que antes probaban "un cliente manda X, se ignora" vía HTTP ahora llaman
// a registrarVenta directamente (mismo criterio que
// ventaEntradasInvalidas.test.js): registrarVenta conserva esa lógica
// interna como defensa en profundidad, aunque ya no sea alcanzable desde
// la ruta con un token de cliente — y ese "ya no alcanzable" se prueba
// aparte, al final del archivo.
//
// A diferencia de los otros archivos "entradas inválidas" (que solo
// ejercitan validación de forma, antes de tocar la base), acá hace falta
// comprobar el *cálculo* del total, que depende del precio leído de
// Producto. Sin una base de pruebas de MySQL disponible (ver
// docs/backend-base-de-datos.md), se simula la persistencia con stubs de
// los métodos de los modelos usados por registrarVenta — igual que hizo la
// revisión independiente ("persistencia simulada") para reproducir el
// error sin necesitar MySQL real. Estos stubs solo devuelven datos falsos
// controlados por la propia prueba: no golpean la base ni corren SQL.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import Venta from '../src/models/venta.model.js';
import DetalleVenta from '../src/models/detalleVenta.model.js';
import Cliente from '../src/models/cliente.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import Producto from '../src/models/producto.model.js';
import PromocionProducto from '../src/models/promocionProducto.model.js';
import DireccionEntrega from '../src/models/direccionEntrega.model.js';
import { registrarVenta } from '../src/services/venta.service.js';
import { tokenCliente, tokenVendedor, autorizacion } from './ayudaAutenticacion.js';

const originales = {};

const producto = {
  idProducto: 5,
  nombre: 'Producto de prueba',
  precio: '100.00',
  stockActual: 10,
  async update(datos) {
    Object.assign(this, datos);
  },
};

let ventaCreada;
let direccionEntregaCreada;

before(() => {
  originales.sequelizeTransaction = sequelize.transaction;
  originales.clienteFindByPk = Cliente.findByPk;
  originales.medioPagoFindByPk = MedioPago.findByPk;
  originales.productoFindByPk = Producto.findByPk;
  originales.promocionFindAll = PromocionProducto.findAll;
  originales.ventaCreate = Venta.create;
  originales.ventaFindByPk = Venta.findByPk;
  originales.detalleVentaCreate = DetalleVenta.create;
  originales.direccionEntregaCreate = DireccionEntrega.create;

  // Transacción falsa: solo ejecuta el callback con un objeto que expone
  // LOCK.UPDATE (lo único que el código lee de él).
  sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });

  Cliente.findByPk = async (id) => ({ idCliente: id });
  MedioPago.findByPk = async (id) => ({ idMedioPago: id, habilitado: true });
  Producto.findByPk = async () => producto;
  PromocionProducto.findAll = async () => [];

  Venta.create = async (datos) => {
    ventaCreada = { idVenta: 1, ...datos };
    return ventaCreada;
  };

  DetalleVenta.create = async () => ({});

  direccionEntregaCreada = undefined;
  DireccionEntrega.create = async (datos) => {
    direccionEntregaCreada = datos;
    return datos;
  };

  // obtenerVentaPorId (llamada al final de registrarVenta) vuelve a leer la
  // venta con Venta.findByPk; se devuelve lo mismo que se "creó".
  Venta.findByPk = async () => ({
    ...ventaCreada,
    cliente: { idCliente: ventaCreada.idCliente },
    medioPago: { idMedioPago: ventaCreada.idMedioPago },
    detalles: [],
    direccionEntrega: direccionEntregaCreada || null,
  });
});

beforeEach(() => {
  producto.stockActual = 10;
  ventaCreada = undefined;
  direccionEntregaCreada = undefined;
});

after(() => {
  sequelize.transaction = originales.sequelizeTransaction;
  Cliente.findByPk = originales.clienteFindByPk;
  MedioPago.findByPk = originales.medioPagoFindByPk;
  Producto.findByPk = originales.productoFindByPk;
  PromocionProducto.findAll = originales.promocionFindAll;
  Venta.create = originales.ventaCreate;
  Venta.findByPk = originales.ventaFindByPk;
  DetalleVenta.create = originales.detalleVentaCreate;
  DireccionEntrega.create = originales.direccionEntregaCreate;
});

const usuarioCliente7 = { idUsuario: 1001, rol: 'cliente', idCliente: 7 };

test('un cliente que manda descuento igual al subtotal NO logra bajar el total (se ignora, no se aplica)', async () => {
  const venta = await registrarVenta(
    {
      idMedioPago: 1,
      detalles: [{ idProducto: 5, cantidad: 1 }],
      descuento: 100, // == el subtotal (precio 100 x cantidad 1)
    },
    usuarioCliente7,
  );

  assert.equal(venta.total, '100.00');
  assert.equal(ventaCreada.descuento, null);
});

test('un cliente que manda minimoMayorista lo ve ignorado (no se persiste)', async () => {
  await registrarVenta(
    {
      idMedioPago: 1,
      detalles: [{ idProducto: 5, cantidad: 1 }],
      minimoMayorista: 50,
    },
    usuarioCliente7,
  );

  assert.equal(ventaCreada.minimoMayorista, null);
});

test('envío a domicilio con dirección válida: se persiste el domicilio en su propia tabla, asociado a la venta', async () => {
  const venta = await registrarVenta(
    {
      idMedioPago: 1,
      detalles: [{ idProducto: 5, cantidad: 1 }],
      metodoEntrega: 'envío a domicilio',
      direccionEntrega: 'Av. Siempre Viva 742, Rosario',
    },
    usuarioCliente7,
  );

  assert.equal(ventaCreada.metodoEntrega, 'envío a domicilio');
  assert.equal(direccionEntregaCreada.idVenta, ventaCreada.idVenta);
  assert.equal(direccionEntregaCreada.direccion, 'Av. Siempre Viva 742, Rosario');
  assert.equal(venta.direccionEntrega.direccion, 'Av. Siempre Viva 742, Rosario');
});

test('retiro en sucursal ignora cualquier dirección que se mande igual (no se crea fila de domicilio)', async () => {
  await registrarVenta(
    {
      idMedioPago: 1,
      detalles: [{ idProducto: 5, cantidad: 1 }],
      metodoEntrega: 'retiro en sucursal',
      direccionEntrega: 'Esto no debería guardarse',
    },
    usuarioCliente7,
  );

  assert.equal(direccionEntregaCreada, undefined);
});

test('POST /api/ventas con un token de cliente responde 403: la ruta es exclusiva del personal desde CU-04 (el cliente compra por /api/compras)', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenCliente(7)))
    .send({
      idMedioPago: 1,
      detalles: [{ idProducto: 5, cantidad: 1 }],
    })
    .expect(403);

  assert.equal(respuesta.body.error, 'No tiene permisos para realizar esta acción');
});

test('el mismo descuento, mandado por un vendedor, SÍ se aplica (es un campo comercial legítimo para personal)', async () => {
  const respuesta = await request(app)
    .post('/api/ventas')
    .set('Authorization', autorizacion(tokenVendedor()))
    .send({
      idCliente: 7,
      idMedioPago: 1,
      detalles: [{ idProducto: 5, cantidad: 1 }],
      descuento: 100,
    })
    .expect(201);

  assert.equal(respuesta.body.total, '0.00');
  assert.equal(ventaCreada.descuento, '100.00');
});
