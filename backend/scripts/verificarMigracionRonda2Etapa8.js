// Verificación (no una suite automática) de que migracionRonda2Etapa8.js
// amplía usuario.rol y agrega producto.idTienda preservando los datos ya
// cargados (incluida una cuenta 'vendedor' histórica, que NO debe
// reinterpretarse), y de que correrla dos veces es segura (idempotente).
// Nunca contra petshop_db — ver docs/backend-base-de-datos.md.
//
// A diferencia de las verificaciones anteriores, acá además hace falta
// `sequelize.sync()` real (con TODOS los modelos actuales importados) entre
// medio: `tienda`/`solicitudvendedor` son tablas NUEVAS que sync() crea
// solo, y la migración necesita que `tienda` ya exista para poder agregar
// la FK de producto.idTienda (ver migracionRonda2Etapa8.js).
//
// Uso:
//   cd backend
//   DOTENV_CONFIG_PATH=.env.test node scripts/verificarMigracionRonda2Etapa8.js
import 'dotenv/config';
import sequelize from '../src/config/database.js';
// Todos los modelos (Etapa 9, hallazgo de Codex): la restauración final
// con sync() solo recrea las tablas de los modelos cargados.
import '../src/models/index.js';
import { aplicarMigracionRonda2Etapa8, ENUM_ROL_FINAL } from './migracionRonda2Etapa8.js';

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

// Recrea, con SQL crudo, el esquema previo mínimo (usuario con el ENUM
// viejo de 3 valores, producto sin idTienda) y carga una cuenta 'vendedor'
// histórica real + un producto histórico real — el caso central que la
// migración NO debe reinterpretar.
const prepararEsquemaPrevio = async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tabla of ['producto', 'usuario', 'tienda', 'solicitudvendedor', 'cliente']) {
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

  // ENUM viejo de 3 valores, tal como estaba antes de esta etapa.
  await sequelize.query(`
    CREATE TABLE usuario (
      idUsuario INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(100) NOT NULL UNIQUE,
      contrasenaHash VARCHAR(255) NOT NULL,
      rol ENUM('cliente','vendedor','administrador') NOT NULL DEFAULT 'cliente',
      idCliente INT NULL UNIQUE
    )
  `);

  // producto SIN idTienda, tal como estaba antes de esta etapa. Sin FKs a
  // categoria/tipomascota/proveedor: no hacen falta para esta verificación
  // puntual (todas nullable, sync() las crea cuando falten).
  await sequelize.query(`
    CREATE TABLE producto (
      idProducto INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(80) NOT NULL,
      descripcion VARCHAR(200) NULL,
      precio DECIMAL(10,2) NOT NULL,
      stockActual INT NOT NULL,
      stockMinimo INT NOT NULL,
      idProveedor INT NULL,
      idTipoMascota INT NULL,
      idCategoria INT NULL
    )
  `);

  await sequelize.query(
    `INSERT INTO usuario (email, contrasenaHash, rol, idCliente)
     VALUES ('vendedor-verificacion-etapa8@petshop.test', 'x', 'vendedor', NULL)`,
  );
  const [[usuarioVendedor]] = await sequelize.query('SELECT LAST_INSERT_ID() AS id');

  await sequelize.query(
    `INSERT INTO producto (nombre, precio, stockActual, stockMinimo)
     VALUES ('Producto histórico de verificación', '100.00', 5, 1)`,
  );
  const [[producto]] = await sequelize.query('SELECT LAST_INSERT_ID() AS id');

  return { idUsuarioVendedor: usuarioVendedor.id, idProducto: producto.id };
};

const verificarResultado = async ({ idUsuarioVendedor, idProducto }) => {
  const tipoColumnaRol = await sequelize
    .query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario' AND COLUMN_NAME = 'rol'`,
    )
    .then(([filas]) => filas[0].COLUMN_TYPE);

  if (tipoColumnaRol !== ENUM_ROL_FINAL) {
    throw new Error(`El ENUM de usuario.rol no quedó en el valor final. Actual: ${tipoColumnaRol}`);
  }

  const [[usuarioHistorico]] = await sequelize.query(
    'SELECT rol FROM usuario WHERE idUsuario = :id',
    { replacements: { id: idUsuarioVendedor } },
  );
  if (usuarioHistorico.rol !== 'vendedor') {
    throw new Error(
      `La cuenta histórica NO debía reinterpretarse: esperaba 'vendedor', quedó en '${usuarioHistorico.rol}'.`,
    );
  }

  const tieneColumnaIdTienda = (
    await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'idTienda'`,
    )
  )[0];
  if (tieneColumnaIdTienda.length === 0) {
    throw new Error('producto.idTienda no se creó.');
  }

  const [[productoHistorico]] = await sequelize.query(
    'SELECT idTienda FROM producto WHERE idProducto = :id',
    { replacements: { id: idProducto } },
  );
  if (productoHistorico.idTienda !== null) {
    throw new Error('El producto histórico debía quedar con idTienda = NULL, no inventarse un valor.');
  }

  // Confirma que el rol nuevo y la FK funcionan de verdad, no solo que el
  // texto del ENUM/la columna existan: un INSERT real de una cuenta
  // 'vendedor_independiente' con una Tienda real, y un producto real
  // referenciando esa tienda.
  await sequelize.query(
    `INSERT INTO usuario (email, contrasenaHash, rol, idCliente) VALUES
     ('vendedor-independiente-verificacion@petshop.test', 'x', 'vendedor_independiente', NULL)`,
  );
  const [[nuevoUsuario]] = await sequelize.query('SELECT LAST_INSERT_ID() AS id');

  await sequelize.query(
    `INSERT INTO tienda (idUsuario, nombre, tipoDocumento, numeroDocumento, estado, creadoEn)
     VALUES (:idUsuario, 'Tienda de verificación', 'CUIL', '20172543597', 'activa', NOW())`,
    { replacements: { idUsuario: nuevoUsuario.id } },
  );
  const [[nuevaTienda]] = await sequelize.query('SELECT LAST_INSERT_ID() AS id');

  await sequelize.query(
    `UPDATE producto SET idTienda = :idTienda WHERE idProducto = :idProducto`,
    { replacements: { idTienda: nuevaTienda.id, idProducto } },
  );

  const [[productoConTienda]] = await sequelize.query(
    'SELECT idTienda FROM producto WHERE idProducto = :id',
    { replacements: { id: idProducto } },
  );
  if (productoConTienda.idTienda !== nuevaTienda.id) {
    throw new Error('La FK producto.idTienda no aceptó un valor real.');
  }

  // La FK debe rechazar una tienda inexistente (comprueba que la
  // restricción es real, no solo una columna suelta).
  let fkRechazoTiendaInexistente = false;
  try {
    await sequelize.query(
      `UPDATE producto SET idTienda = 999999 WHERE idProducto = :id`,
      { replacements: { id: idProducto } },
    );
  } catch {
    fkRechazoTiendaInexistente = true;
  }
  if (!fkRechazoTiendaInexistente) {
    throw new Error('La FK de producto.idTienda no rechazó una tienda inexistente — no es una FK real.');
  }

  console.log('OK: ENUM de usuario.rol final (4 valores), cuenta histórica \'vendedor\' intacta,');
  console.log('    producto.idTienda creado en NULL para filas existentes, FK real (acepta una');
  console.log('    tienda real, rechaza una inexistente).');
};

const verificar = async () => {
  await sequelize.authenticate();
  await asegurarBasePermitida();

  console.log('\n--- Preparando esquema PREVIO (ENUM de 3 valores, sin idTienda), con datos históricos ---');
  const contexto = await prepararEsquemaPrevio();
  console.log(`Cuenta 'vendedor' histórica #${contexto.idUsuarioVendedor}, producto histórico #${contexto.idProducto}.`);

  console.log('\n--- sync() crea las tablas NUEVAS (tienda, solicitudvendedor) ---');
  await sequelize.sync();

  console.log('\n--- Aplicando la migración (primera vez) ---');
  await aplicarMigracionRonda2Etapa8(sequelize, (linea) => console.log(linea));
  await verificarResultado(contexto);

  console.log('\n--- Aplicando la migración de nuevo (debe ser un no-op seguro: idempotencia) ---');
  await aplicarMigracionRonda2Etapa8(sequelize, (linea) => console.log(linea));

  await verificarCasosDeEtapa9();

  console.log('\n--- Restaurando petshop_test al esquema completo de los modelos ---');
  await restaurarEsquemaCompleto();

  console.log('\nVerificación de migración Ronda 2, Etapa 8: OK.');
  await sequelize.close();
};

const contarForeignKeysIdTienda = async () => {
  const [filas] = await sequelize.query(
    `SELECT CONSTRAINT_NAME AS nombre FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'idTienda'
       AND REFERENCED_TABLE_NAME = 'tienda'`,
  );
  return filas.map((fila) => fila.nombre);
};

const esperarFallo = async (descripcion) => {
  try {
    await aplicarMigracionRonda2Etapa8(sequelize, () => {});
  } catch (error) {
    console.log(`  OK, abortó como se esperaba (${descripcion}): ${error.message}`);
    return;
  }
  throw new Error(`La migración debía abortar (${descripcion}) y no lo hizo.`);
};

// Etapa 9 (revisión de diseño de Codex): casos que la versión anterior del
// script de migración no contemplaba.
const verificarCasosDeEtapa9 = async () => {
  console.log('\n--- Etapa 9: FK equivalente con OTRO nombre (como la crearía sync()) ---');
  await sequelize.query('ALTER TABLE producto DROP FOREIGN KEY fk_producto_tienda');
  await sequelize.query(
    'ALTER TABLE producto ADD CONSTRAINT producto_ibfk_verificacion FOREIGN KEY (idTienda) REFERENCES tienda(idTienda)',
  );
  await aplicarMigracionRonda2Etapa8(sequelize, (linea) => console.log(linea));
  const fks = await contarForeignKeysIdTienda();
  if (fks.length !== 1 || fks[0] !== 'producto_ibfk_verificacion') {
    throw new Error(`Esperaba una sola FK (producto_ibfk_verificacion), hay: ${fks.join(', ') || 'ninguna'}.`);
  }
  console.log('  OK: reconoció la FK existente y no creó una segunda.');

  console.log('\n--- Etapa 9: producto.idTienda con un tipo incompatible ---');
  await sequelize.query('ALTER TABLE producto DROP FOREIGN KEY producto_ibfk_verificacion');
  await sequelize.query('ALTER TABLE producto MODIFY idTienda BIGINT NULL');
  await esperarFallo('columna BIGINT');
  const [[columna]] = await sequelize.query("SHOW COLUMNS FROM producto LIKE 'idTienda'");
  if (!/^bigint/i.test(columna.Type)) {
    throw new Error(`La migración no debía tocar la columna incompatible; quedó ${columna.Type}.`);
  }
  await sequelize.query('ALTER TABLE producto MODIFY idTienda INT NULL');
  await aplicarMigracionRonda2Etapa8(sequelize, (linea) => console.log(linea));
  if ((await contarForeignKeysIdTienda()).length !== 1) {
    throw new Error('Tras corregir la columna a mano, la reanudación debía crear la FK.');
  }
  console.log('  OK: abortó sin modificar, y la reanudación completó el paso.');

  console.log('\n--- Etapa 9: usuario.rol con un valor que el ENUM final no incluye ---');
  const enumConValorExtra = "enum('cliente','vendedor','administrador','vendedor_independiente','valor_raro')";
  await sequelize.query(`ALTER TABLE usuario MODIFY rol ${enumConValorExtra} NOT NULL DEFAULT 'cliente'`);
  await esperarFallo('valor fuera del ENUM final');
  const [[rol]] = await sequelize.query("SHOW COLUMNS FROM usuario LIKE 'rol'");
  if (rol.Type !== enumConValorExtra) {
    throw new Error(`La migración no debía tocar usuario.rol; quedó ${rol.Type}.`);
  }
  await sequelize.query(`ALTER TABLE usuario MODIFY rol ${ENUM_ROL_FINAL} NOT NULL DEFAULT 'cliente'`);
  console.log('  OK: abortó sin modificar el ENUM.');
};

// Las tablas recreadas con SQL mínimo no tienen todas las columnas/FKs de
// los modelos actuales: si quedaran así, rompen otras pruebas de
// integración (pasó en la Etapa 8). Se borran y sync() las recrea completas.
const restaurarEsquemaCompleto = async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tabla of ['producto', 'solicitudvendedor', 'tienda', 'usuario', 'cliente']) {
    await sequelize.query(`DROP TABLE IF EXISTS ${tabla}`);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await sequelize.sync();
};

verificar().catch((error) => {
  console.error('\nVerificación de migración Ronda 2, Etapa 8 FALLÓ:', error.message);
  process.exit(1);
});
