// Elimina la columna obsoleta `promocionproducto.idCategoria` después de
// aplicar las reglas de promoción por producto.
//
// Uso:
//   cd backend
//   node scripts/migrarPromociones.js --confirmar
//
// Sin --confirmar solo informa la base y el usuario de conexión.
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import { aplicarMigracionPromociones } from './migracionPromociones.js';
import { informarFalloMigracion } from './utilMigracion.js';

const confirmado = process.argv.includes('--confirmar');

const ejecutar = async () => {
  await sequelize.authenticate();
  const [[fila]] = await sequelize.query(
    'SELECT DATABASE() AS base, CURRENT_USER() AS usuario',
  );

  console.log(`Conectado a la base "${fila.base}" como "${fila.usuario}".`);

  if (!confirmado) {
    console.log('\nModo informativo (sin --confirmar): no se modificó nada.');
    console.log('Para aplicar la migración, volvé a correr con --confirmar:');
    console.log('  node scripts/migrarPromociones.js --confirmar');
    await sequelize.close();
    return;
  }

  console.log('\nAplicando migración de promociones...');
  await aplicarMigracionPromociones(sequelize, (linea) => console.log(linea));
  console.log('\nMigración aplicada. Confirmá el esquema con: node scripts/verificarEsquemaActual.js');
  await sequelize.close();
};

ejecutar().catch((error) => {
  informarFalloMigracion(error, {
    script: 'migrarPromociones.js',
    consultasInspeccion: [
      "SHOW COLUMNS FROM promocionproducto LIKE 'idCategoria';",
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promocionproducto' AND COLUMN_NAME = 'idCategoria' AND REFERENCED_TABLE_NAME IS NOT NULL;",
    ],
  });
  process.exit(1);
});
