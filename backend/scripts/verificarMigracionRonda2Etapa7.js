// Verificación (no una suite automática) de que migracionRonda2Etapa7.js
// amplía el ENUM de venta.estado preservando los datos ya cargados
// (incluida una venta histórica ya 'enviada', que NO debe reinterpretarse),
// y de que correrla dos veces es segura (idempotente). Nunca contra
// petshop_db — ver docs/backend-base-de-datos.md.
//
// Uso:
//   cd backend
//   DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionRonda2Etapa7.js
import 'dotenv/config';
import sequelize from '../src/config/database.js';
// Todos los modelos (Etapa 9, hallazgo de Codex): la restauración final
// con sync() solo recrea las tablas de los modelos cargados.
import '../src/models/index.js';
import { aplicarMigracionRonda2Etapa7, ENUM_FINAL } from './migracionRonda2Etapa7.js';

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

// Recrea, con SQL crudo, el esquema previo mínimo (venta con el ENUM viejo
// de 3 valores) y carga una venta 'enviada' real — el caso central que la
// migración NO debe reinterpretar, sea cual fuere el metodoEntrega real de
// esa venta histórica.
const prepararEsquemaPrevio = async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tabla of ['venta', 'cliente', 'mediopago']) {
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

  await sequelize.query(`
    CREATE TABLE mediopago (
      idMedioPago INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50) NOT NULL,
      descripcion VARCHAR(150) NULL,
      habilitado TINYINT(1) NOT NULL DEFAULT 1
    )
  `);

  // ENUM viejo de 3 valores, tal como estaba antes de esta etapa.
  await sequelize.query(`
    CREATE TABLE venta (
      idVenta INT AUTO_INCREMENT PRIMARY KEY,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total DECIMAL(10,2) NOT NULL,
      estado ENUM('registrada','cancelada','enviada') NOT NULL DEFAULT 'registrada',
      metodoEntrega VARCHAR(50) NULL,
      idCliente INT NOT NULL,
      idMedioPago INT NOT NULL
    )
  `);

  await sequelize.query(
    `INSERT INTO cliente (nombre, apellido) VALUES ('Verificación', 'Etapa7')`,
  );
  const idCliente = (await sequelize.query('SELECT LAST_INSERT_ID() AS id'))[0][0].id;

  await sequelize.query(`INSERT INTO mediopago (nombre) VALUES ('Efectivo de verificación')`);
  const idMedioPago = (await sequelize.query('SELECT LAST_INSERT_ID() AS id'))[0][0].id;

  // Venta histórica ya 'enviada' bajo la semántica VIEJA (retiro en
  // sucursal, en este caso) — el caso que demuestra que la migración no
  // reinterpreta nada: debe seguir en 'enviada' después, no pasar a
  // 'entregada' ni a 'lista_para_retirar' por sí sola.
  await sequelize.query(
    `INSERT INTO venta (total, estado, metodoEntrega, idCliente, idMedioPago)
     VALUES ('500.00', 'enviada', 'retiro en sucursal', :idCliente, :idMedioPago)`,
    { replacements: { idCliente, idMedioPago } },
  );
  const [[venta]] = await sequelize.query('SELECT LAST_INSERT_ID() AS id');

  return { idVenta: venta.id };
};

const verificarResultado = async ({ idVenta }) => {
  const tipoColumna = await sequelize.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venta' AND COLUMN_NAME = 'estado'`,
  ).then(([filas]) => filas[0].COLUMN_TYPE);

  if (tipoColumna !== ENUM_FINAL) {
    throw new Error(`El ENUM de venta.estado no quedó en el valor final. Actual: ${tipoColumna}`);
  }

  const [[ventaHistorica]] = await sequelize.query(
    'SELECT estado, metodoEntrega FROM venta WHERE idVenta = :idVenta',
    { replacements: { idVenta } },
  );

  if (ventaHistorica.estado !== 'enviada') {
    throw new Error(
      `La venta histórica NO debía reinterpretarse: esperaba 'enviada', quedó en '${ventaHistorica.estado}'.`,
    );
  }

  // Confirma que los 2 valores nuevos son aceptables de verdad (no solo que
  // el texto del ENUM los liste): un INSERT/UPDATE real con cada uno.
  await sequelize.query(
    `UPDATE venta SET estado = 'lista_para_retirar' WHERE idVenta = :idVenta`,
    { replacements: { idVenta } },
  );
  await sequelize.query(
    `UPDATE venta SET estado = 'entregada' WHERE idVenta = :idVenta`,
    { replacements: { idVenta } },
  );
  const [[trasActualizar]] = await sequelize.query(
    'SELECT estado FROM venta WHERE idVenta = :idVenta',
    { replacements: { idVenta } },
  );
  if (trasActualizar.estado !== 'entregada') {
    throw new Error('Los valores nuevos del ENUM no se pudieron escribir de verdad.');
  }

  console.log('OK: ENUM final (5 valores), venta histórica \'enviada\' intacta (no reinterpretada),');
  console.log('    los 2 valores nuevos aceptan escrituras reales.');
};

const verificar = async () => {
  await sequelize.authenticate();
  await asegurarBasePermitida();

  console.log('\n--- Preparando esquema PREVIO (ENUM de 3 valores), con una venta histórica ---');
  const contexto = await prepararEsquemaPrevio();
  console.log(`Venta histórica cargada: #${contexto.idVenta}, estado 'enviada' (retiro en sucursal).`);

  console.log('\n--- Aplicando la migración (primera vez) ---');
  await aplicarMigracionRonda2Etapa7(sequelize, (linea) => console.log(linea));
  await verificarResultado(contexto);

  console.log("\n--- Aplicando la migración de nuevo (debe ser un no-op seguro: idempotencia) ---");
  await aplicarMigracionRonda2Etapa7(sequelize, (linea) => console.log(linea));

  const tipoColumnaFinal = await sequelize.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venta' AND COLUMN_NAME = 'estado'`,
  ).then(([filas]) => filas[0].COLUMN_TYPE);
  if (tipoColumnaFinal !== ENUM_FINAL) {
    throw new Error('La segunda corrida de la migración alteró el ENUM de forma inesperada.');
  }

  // Etapa 9: las tablas recreadas con SQL mínimo quedaban así en
  // petshop_test y podían romper otras pruebas de integración; se borran y
  // sync() las recrea con el esquema completo de los modelos.
  console.log('\n--- Restaurando petshop_test al esquema completo de los modelos ---');
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tabla of ['venta', 'cliente', 'mediopago']) {
    await sequelize.query(`DROP TABLE IF EXISTS ${tabla}`);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await sequelize.sync();

  console.log('\nVerificación de migración Ronda 2, Etapa 7: OK.');
  await sequelize.close();
};

verificar().catch((error) => {
  console.error('\nVerificación de migración Ronda 2, Etapa 7 FALLÓ:', error.message);
  process.exit(1);
});
