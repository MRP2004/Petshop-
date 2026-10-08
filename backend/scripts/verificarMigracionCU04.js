// Verificación puntual (no una suite automática) de que agregar las tablas
// de CU-04 es seguro tanto en una instalación NUEVA como en la
// ACTUALIZACIÓN de un esquema previo que ya tenía datos — ver
// docs/backend-base-de-datos.md, "Migración de esquema (CU-04)".
//
// No hay ALTER TABLE en ningún lado: las cuatro tablas nuevas (pago,
// comprobante, detalleventapromocion, intentocompra) son eso, TABLAS
// NUEVAS, así que sequelize.sync() (el mismo mecanismo ya usado desde
// direccionEntrega/imagenProducto) ya es el procedimiento de actualización
// completo — no hace falta un script de migración aparte. Esto solo lo
// demuestra contra una base descartable, nunca contra petshop_db.
//
// Uso (requiere la misma habilitación que test-integracion/, y solo corre
// contra el nombre de base permitido):
//   cd backend
//   DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionCU04.js
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import '../src/models/tipoMascota.model.js';
import '../src/models/categoria.model.js';
import '../src/models/proveedor.model.js';
import '../src/models/producto.model.js';
import '../src/models/cliente.model.js';
import '../src/models/medioPago.model.js';
import '../src/models/venta.model.js';
import '../src/models/detalleVenta.model.js';
import '../src/models/usuario.model.js';
import '../src/models/promocionProducto.model.js';
import '../src/models/direccionEntrega.model.js';
import '../src/models/imagenProducto.model.js';
import '../src/models/intentoCompra.model.js';
import '../src/models/pago.model.js';
import '../src/models/comprobante.model.js';
import '../src/models/detalleVentaPromocion.model.js';
import Cliente from '../src/models/cliente.model.js';
import MedioPago from '../src/models/medioPago.model.js';
import Producto from '../src/models/producto.model.js';
import Venta from '../src/models/venta.model.js';
import DetalleVenta from '../src/models/detalleVenta.model.js';

const NOMBRE_BASE_PERMITIDA = process.env.INTEGRACION_DB_NAME_PERMITIDA || 'petshop_test';

const asegurarBasePermitida = async () => {
  if (process.env.PERMITIR_LIMPIEZA_INTEGRACION !== 'si') {
    throw new Error('Falta PERMITIR_LIMPIEZA_INTEGRACION=si. Abortando.');
  }
  if (process.env.DB_NAME !== NOMBRE_BASE_PERMITIDA) {
    throw new Error(`DB_NAME debe ser exactamente "${NOMBRE_BASE_PERMITIDA}". Abortando.`);
  }
  const [[fila]] = await sequelize.query('SELECT DATABASE() AS nombre');
  if (fila.nombre !== NOMBRE_BASE_PERMITIDA) {
    throw new Error(`La conexión real usa "${fila.nombre}". Abortando antes de tocar nada.`);
  }
};

const TABLAS_TODAS = [
  'imagenproducto', 'promocionproducto', 'usuario', 'direccionentrega',
  'pago', 'comprobante', 'detalleventapromocion', 'intentocompra',
  'detalleventa', 'venta', 'producto', 'categoria', 'tipomascota',
  'proveedor', 'cliente', 'mediopago',
];

const TABLAS_CU04 = ['pago', 'comprobante', 'detalleventapromocion', 'intentocompra'];

const listarTablasExistentes = async () => {
  const [filas] = await sequelize.query('SHOW TABLES');
  return filas.map((fila) => Object.values(fila)[0]);
};

const paso1_instalacionNueva = async () => {
  console.log('\n--- Paso 1: instalación NUEVA (esquema completo desde cero) ---');
  for (const tabla of TABLAS_TODAS) {
    await sequelize.query(`DROP TABLE IF EXISTS ${tabla}`);
  }
  await sequelize.sync();
  const tablas = await listarTablasExistentes();
  for (const tabla of [...TABLAS_TODAS, 'intentocompra']) {
    if (!tablas.includes(tabla)) {
      throw new Error(`Falta la tabla "${tabla}" después de sync() en una base vacía.`);
    }
  }
  console.log(`OK: las ${TABLAS_TODAS.length} tablas existen, incluidas las 4 nuevas de CU-04.`);
};

const paso2_actualizacionConDatos = async () => {
  console.log('\n--- Paso 2: actualización de un esquema PREVIO (con datos ya cargados) ---');

  // Simula el estado "antes de CU-04": borra SOLO las 4 tablas nuevas,
  // dejando el resto del esquema (y los datos que se carguen ahora) como si
  // fuera una base de desarrollo real que todavía no las tiene.
  for (const tabla of TABLAS_CU04) {
    await sequelize.query(`DROP TABLE IF EXISTS ${tabla}`);
  }

  // Se insertan con los modelos "de base" (Cliente/MedioPago/Producto/Venta/
  // DetalleVenta) directamente, NO con registrarVenta/obtenerVentaPorId: esos
  // servicios ya incluyen las asociaciones nuevas (Pago/Comprobante/
  // DetalleVentaPromocion, ver venta.service.js#relacionesVenta), que en
  // este punto todavía no existen a propósito — representan datos cargados
  // por una versión ANTERIOR del código, antes de esta migración.
  const cliente = await Cliente.create({ nombre: 'Verificación', apellido: 'Migración', email: null });
  const medioPago = await MedioPago.create({ nombre: 'Efectivo verificación', habilitado: true });
  const producto = await Producto.create({
    nombre: 'Producto verificación migración', precio: '100.00', stockActual: 10, stockMinimo: 1,
  });
  const ventaPrevia = await Venta.create({
    total: '200.00', estado: 'registrada', idCliente: cliente.idCliente, idMedioPago: medioPago.idMedioPago,
  });
  await DetalleVenta.create({
    cantidad: 2, precioUnitario: '100.00', subtotal: '200.00',
    idVenta: ventaPrevia.idVenta, idProducto: producto.idProducto,
  });
  await producto.update({ stockActual: 8 });
  console.log(`Datos "previos" cargados: venta #${ventaPrevia.idVenta} (esquema sin las tablas de CU-04 todavía).`);

  // Esto es, literalmente, "reiniciar el backend": server.js llama a
  // sequelize.sync() en cada arranque.
  await sequelize.sync();

  const tablas = await listarTablasExistentes();
  for (const tabla of TABLAS_CU04) {
    if (!tablas.includes(tabla)) {
      throw new Error(`Falta la tabla "${tabla}" después de sync() sobre un esquema previo.`);
    }
  }

  const ventaReleida = await Venta.findByPk(ventaPrevia.idVenta);
  if (!ventaReleida || ventaReleida.total !== '200.00') {
    throw new Error('La venta cargada ANTES de sync() no sobrevivió intacta.');
  }
  const productoReleido = await Producto.findByPk(producto.idProducto);
  if (productoReleido.stockActual !== 8) {
    throw new Error('El stock del producto cargado ANTES de sync() cambió.');
  }

  console.log('OK: las 4 tablas de CU-04 se crearon, y la venta/producto cargados ANTES de sync() siguen intactos.');
};

const verificar = async () => {
  await sequelize.authenticate();
  await asegurarBasePermitida();
  await paso1_instalacionNueva();
  await paso2_actualizacionConDatos();
  console.log('\nVerificación de migración CU-04: OK (instalación nueva y actualización con datos, ambas contra una base descartable).');
  await sequelize.close();
};

verificar().catch((error) => {
  console.error('\nVerificación de migración CU-04 FALLÓ:', error.message);
  process.exit(1);
});
