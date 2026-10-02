const existeTabla = async (sequelize, tabla) => {
  const [filas] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla`,
    { replacements: { tabla } },
  );
  return filas.length > 0;
};

const existeColumna = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas.length > 0;
};

const aplicarMigracionPromociones = async (sequelize, log = console.log) => {
  if (!(await existeTabla(sequelize, 'promocionproducto'))) {
    throw new Error(
      'No existe la tabla promocionproducto. Creá primero las tablas nuevas y volvé a ejecutar la migración.',
    );
  }

  if (!(await existeColumna(sequelize, 'promocionproducto', 'idCategoria'))) {
    log('  promocionproducto.idCategoria: ya no existe, nada que hacer.');
    return;
  }

  const [foreignKeys] = await sequelize.query(
    `SELECT DISTINCT CONSTRAINT_NAME AS nombre
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'promocionproducto'
       AND COLUMN_NAME = 'idCategoria'
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );

  for (const { nombre } of foreignKeys) {
    const identificador = `\`${String(nombre).replace(/`/g, '``')}\``;
    await sequelize.query(
      `ALTER TABLE promocionproducto DROP FOREIGN KEY ${identificador}`,
    );
    log(`  Se eliminó la FK ${nombre} de promocionproducto.idCategoria.`);
  }

  const [[conteo]] = await sequelize.query(
    'SELECT COUNT(*) AS cantidad FROM promocionproducto WHERE idCategoria IS NOT NULL',
  );

  await sequelize.query('ALTER TABLE promocionproducto DROP COLUMN idCategoria');
  log(
    `  promocionproducto.idCategoria: columna eliminada; ${conteo.cantidad} valor(es) de categoría asociados fueron descartados.`,
  );
};

export { aplicarMigracionPromociones };
