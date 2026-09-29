// Procedimiento de migración versionado e idempotente para la Etapa 8 de
// la ronda 2 ("marketplace: vendedores independientes" — ver
// docs/estado-proyecto.md). Diseño de esquema y autorización revisado con
// Codex ANTES de escribir este archivo (ver EVIDENCIA-codex-etapa8-diseno-
// revision.txt en el ZIP de entrega de esta etapa).
//
// Dos cambios sobre tablas EXISTENTES, los dos 100% aditivos (sin ningún
// UPDATE de filas ya cargadas):
//   1. `usuario.rol`: ENUM ampliado agregando 'vendedor_independiente' al
//      final. Ninguna cuenta con rol='vendedor' cambia de significado.
//   2. `producto.idTienda`: columna NUEVA, NULLABLE, con su índice y su FK
//      hacia `tienda.idTienda` (ON DELETE/UPDATE NO ACTION, mismo criterio
//      que el resto de las FKs opcionales del proyecto — ver
//      docs/backend-base-de-datos.md). Toda fila existente queda en NULL
//      ("catálogo de PetShop"), sin excepción.
// Las tablas `tienda` y `solicitudvendedor` son NUEVAS: no necesitan este
// script, `sequelize.sync()` las crea solo (igual que favorito/aviso en
// las etapas anteriores).
import { asegurarQueAmplia } from './utilMigracion.js';

const ENUM_ROL_FINAL ="enum('cliente','vendedor','administrador','vendedor_independiente')";

const obtenerTipoColumna = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas[0]?.COLUMN_TYPE || null;
};

const obtenerDefinicionColumna = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_TYPE AS tipo, IS_NULLABLE AS nullable FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas[0] || null;
};

// Busca la FK por lo que HACE (producto.idTienda → tienda.idTienda), no por
// su nombre (Etapa 9, revisión de Codex): una base creada o completada por
// sync() puede tener una FK equivalente con otro nombre (p. ej.
// producto_ibfk_4), y buscar solo 'fk_producto_tienda' llevaría a crear una
// segunda restricción redundante.
const buscarForeignKeyIdTienda = async (sequelize) => {
  const [filas] = await sequelize.query(
    `SELECT CONSTRAINT_NAME AS nombre FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'idTienda'
       AND REFERENCED_TABLE_NAME = 'tienda' AND REFERENCED_COLUMN_NAME = 'idTienda'`,
  );
  return filas[0]?.nombre || null;
};

// --- Paso 1: ENUM de usuario.rol ---
const migrarRolUsuario = async (sequelize, log) => {
  const tipoActual = await obtenerTipoColumna(sequelize, 'usuario', 'rol');

  if (tipoActual === ENUM_ROL_FINAL) {
    log('  usuario.rol: ya tiene el ENUM final, nada que hacer.');
    return;
  }

  asegurarQueAmplia('usuario', 'rol', tipoActual, ENUM_ROL_FINAL);

  await sequelize.query(
    `ALTER TABLE usuario MODIFY rol ${ENUM_ROL_FINAL} NOT NULL DEFAULT 'cliente'`,
  );
  log('  usuario.rol: ENUM ampliado a 4 valores (sin tocar ninguna fila existente).');
};

// --- Paso 2: producto.idTienda (columna + índice + FK) ---
// Requiere que `tienda` ya exista (la crea sequelize.sync() al arrancar el
// backend, ANTES de correr este script — ver instrucciones en
// migrarRonda2Etapa8.js): la FK no puede crearse contra una tabla que
// todavía no existe.
const migrarIdTiendaProducto = async (sequelize, log) => {
  const [[{ existeTabla }]] = await sequelize.query(
    `SELECT COUNT(*) AS existeTabla FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tienda'`,
  );

  if (Number(existeTabla) === 0) {
    throw new Error(
      'La tabla "tienda" todavía no existe. Creala con `node scripts/crearTablasNuevas.js --confirmar` ' +
        '(es una tabla nueva: sync() la crea sin tocar las existentes) y volvé a correr esta migración.',
    );
  }

  const columnaTienda = await obtenerDefinicionColumna(sequelize, 'tienda', 'idTienda');
  const columnaExistente = await obtenerDefinicionColumna(sequelize, 'producto', 'idTienda');

  if (!columnaExistente) {
    await sequelize.query(`ALTER TABLE producto ADD COLUMN idTienda ${columnaTienda.tipo} NULL`);
    log('  producto.idTienda: columna agregada (NULL en todas las filas existentes, a propósito).');
  } else if (columnaExistente.tipo !== columnaTienda.tipo || columnaExistente.nullable !== 'YES') {
    // Etapa 9 (revisión de Codex): antes, "la columna existe" alcanzaba para
    // darla por buena. Con otro tipo o NOT NULL, la FK fallaría o cambiaría
    // el significado de los productos de PetShop (NULL): se aborta sin tocar.
    throw new Error(
      `producto.idTienda ya existe pero con una definición incompatible (${columnaExistente.tipo}, ` +
        `nullable=${columnaExistente.nullable}; se esperaba ${columnaTienda.tipo} NULL, igual que ` +
        'tienda.idTienda). Revisala a mano antes de reintentar: este script no la modifica.',
    );
  } else {
    log('  producto.idTienda: la columna ya existe con la definición esperada, nada que hacer.');
  }

  const NOMBRE_FK = 'fk_producto_tienda';
  const fkExistente = await buscarForeignKeyIdTienda(sequelize);

  if (fkExistente) {
    log(`  producto.idTienda: ya existe una FK hacia tienda.idTienda (${fkExistente}), nada que hacer.`);
    return;
  }

  // El índice queda implícito al crear la FK (MySQL lo agrega solo si no
  // hay uno ya sobre esa columna) — no hace falta un CREATE INDEX aparte.
  await sequelize.query(
    `ALTER TABLE producto
     ADD CONSTRAINT ${NOMBRE_FK} FOREIGN KEY (idTienda) REFERENCES tienda(idTienda)
     ON DELETE NO ACTION ON UPDATE NO ACTION`,
  );
  log('  producto.idTienda: FK e índice creados.');
};

const aplicarMigracionRonda2Etapa8 = async (sequelize, log = console.log) => {
  log('Paso 1/2: ampliar el ENUM de usuario.rol');
  await migrarRolUsuario(sequelize, log);

  log('Paso 2/2: agregar producto.idTienda (columna, índice y FK)');
  await migrarIdTiendaProducto(sequelize, log);
};

export { aplicarMigracionRonda2Etapa8, ENUM_ROL_FINAL };
