// Verificación (no una suite automática) de que migracionCU04Ronda2.js
// aplica correctamente sobre un esquema PREVIO (el de la primera entrega de
// CU-04: ENUM viejo, sin instantánea del comprador, sin índice único en
// mediopago.nombre) preservando los datos ya cargados, y de que correrla dos
// veces es seguro (idempotente). Nunca contra petshop_db — ver
// docs/backend-base-de-datos.md.
//
// Uso:
//   cd backend
//   DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionCU04Ronda2.js
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import { aplicarMigracionCU04Ronda2, ENUM_FINAL } from './migracionCU04Ronda2.js';

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

// Recrea, con SQL crudo, el esquema previo relevante (mediopago sin índice
// único, comprobante con el ENUM y las columnas de la primera entrega de
// CU-04), y carga datos "ya existentes" para comprobar que sobreviven.
const prepararEsquemaPrevio = async () => {
  // FK checks desactivadas solo durante este DROP/CREATE puntual: la base
  // de pruebas puede tener otras tablas (direccionentrega, etc.) con FKs
  // hacia `venta` que no son relevantes para esta verificación puntual del
  // ENUM/columnas de `comprobante` y el índice de `mediopago` — no hace
  // falta enumerarlas todas para poder recrear un esquema "previo" mínimo.
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tabla of ['comprobante', 'pago', 'detalleventapromocion', 'intentocompra', 'detalleventa', 'venta', 'mediopago', 'cliente']) {
    await sequelize.query(`DROP TABLE IF EXISTS ${tabla}`);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  await sequelize.query(`
    CREATE TABLE cliente (
      idCliente INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL,
      apellido VARCHAR(50) NOT NULL,
      email VARCHAR(100) NULL,
      telefono VARCHAR(30) NULL,
      direccion VARCHAR(150) NULL
    )
  `);

  // Sin índice único sobre nombre: el estado "previo" que la migración debe corregir.
  await sequelize.query(`
    CREATE TABLE mediopago (
      idMedioPago INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL,
      descripcion VARCHAR(150) NULL,
      habilitado TINYINT(1) NOT NULL DEFAULT 1
    )
  `);

  await sequelize.query(`
    CREATE TABLE venta (
      idVenta INT AUTO_INCREMENT PRIMARY KEY,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total DECIMAL(10,2) NOT NULL,
      estado VARCHAR(20) NOT NULL,
      metodoEntrega VARCHAR(30) NULL,
      idCliente INT NOT NULL,
      idMedioPago INT NOT NULL
    )
  `);

  await sequelize.query(`
    CREATE TABLE detalleventa (
      idDetalleVenta INT AUTO_INCREMENT PRIMARY KEY,
      cantidad INT NOT NULL,
      precioUnitario DECIMAL(10,2) NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      idVenta INT NOT NULL,
      idProducto INT NOT NULL
    )
  `);

  // ENUM y columnas de la PRIMERA entrega de CU-04 (sin 'simulado' ni
  // instantánea del comprador): el estado que esta migración debe llevar al
  // final.
  await sequelize.query(`
    CREATE TABLE comprobante (
      idVenta INT PRIMARY KEY,
      numero VARCHAR(20) NOT NULL UNIQUE,
      estadoCorreo ENUM('pendiente','enviado','fallido','no_aplica') NOT NULL DEFAULT 'pendiente',
      intentosEnvioCorreo INT NOT NULL DEFAULT 0,
      generadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sequelize.query(
    `INSERT INTO cliente (nombre, apellido, email) VALUES ('Verificación', 'Previa', 'verificacion@petshop.test')`,
  );
  const idCliente = (await sequelize.query('SELECT LAST_INSERT_ID() AS id'))[0][0].id;

  await sequelize.query(
    `INSERT INTO mediopago (nombre, habilitado) VALUES ('Transferencia bancaria (simulada)', 1), ('Débito (simulado)', 1)`,
  );

  await sequelize.query(
    `INSERT INTO venta (total, estado, idCliente, idMedioPago) VALUES ('500.00', 'registrada', :idCliente, 1)`,
    { replacements: { idCliente } },
  );
  const [[venta]] = await sequelize.query('SELECT LAST_INSERT_ID() AS id');
  const idVenta = venta.id;

  // Comprobante YA con estadoCorreo='enviado' (el caso central a migrar) y
  // sin ninguna de las 3 columnas de instantánea, porque en el esquema
  // previo no existían.
  await sequelize.query(
    `INSERT INTO comprobante (idVenta, numero, estadoCorreo, intentosEnvioCorreo)
     VALUES (:idVenta, 'PS-2026-VERPREV', 'enviado', 1)`,
    { replacements: { idVenta } },
  );

  return { idVenta };
};

const verificarResultado = async ({ idVenta }) => {
  const tipoColumna = (
    await sequelize.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobante' AND COLUMN_NAME = 'estadoCorreo'`,
    )
  )[0][0].COLUMN_TYPE;

  if (tipoColumna !== ENUM_FINAL) {
    throw new Error(`El ENUM de estadoCorreo no quedó en el valor final. Actual: ${tipoColumna}`);
  }

  const [[comprobante]] = await sequelize.query(
    `SELECT estadoCorreo, numero, nombreCompradorHistorico, apellidoCompradorHistorico, correoCompradorHistorico
     FROM comprobante WHERE idVenta = :idVenta`,
    { replacements: { idVenta } },
  );

  if (comprobante.estadoCorreo !== 'simulado') {
    throw new Error(`El 'enviado' previo no se migró a 'simulado'. Quedó en: ${comprobante.estadoCorreo}`);
  }
  if (comprobante.numero !== 'PS-2026-VERPREV') {
    throw new Error('El comprobante previo no sobrevivió intacto (número distinto).');
  }
  if (
    comprobante.nombreCompradorHistorico !== null ||
    comprobante.apellidoCompradorHistorico !== null ||
    comprobante.correoCompradorHistorico !== null
  ) {
    throw new Error('Las columnas de instantánea de un comprobante previo deberían quedar NULL, no inventarse un valor.');
  }

  const [indices] = await sequelize.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mediopago' AND INDEX_NAME = 'ux_mediopago_nombre'`,
  );
  if (indices.length === 0) {
    throw new Error('No se creó el índice único sobre mediopago.nombre.');
  }

  console.log('OK: ENUM final, dato migrado (enviado→simulado), comprobante previo intacto,');
  console.log('    columnas de instantánea NULL (no inventadas), índice único creado.');
};

const verificar = async () => {
  await sequelize.authenticate();
  await asegurarBasePermitida();

  console.log('\n--- Preparando esquema PREVIO (primera entrega de CU-04), con datos ---');
  const contexto = await prepararEsquemaPrevio();
  console.log(`Datos previos cargados: venta #${contexto.idVenta}, comprobante 'enviado'.`);

  console.log('\n--- Aplicando la migración (primera vez) ---');
  await aplicarMigracionCU04Ronda2(sequelize, (linea) => console.log(linea));
  await verificarResultado(contexto);

  console.log('\n--- Aplicando la migración de nuevo (debe ser un no-op seguro: idempotencia) ---');
  await aplicarMigracionCU04Ronda2(sequelize, (linea) => console.log(linea));
  await verificarResultado(contexto);

  console.log('\nVerificación de migración CU-04 ronda 2: OK.');
  await sequelize.close();
};

verificar().catch((error) => {
  console.error('\nVerificación de migración CU-04 ronda 2 FALLÓ:', error.message);
  process.exit(1);
});
