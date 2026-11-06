// Script manual para actualizar una base de desarrollo existente sin
// perder datos.
//
// A diferencia de los scripts de test-integracion/ o de verificación, este
// NO restringe DB_NAME a "petshop_test": su
// propósito es correr justamente contra la base de desarrollo real, leyendo
// la configuración de .env tal cual la tiene Mauro. Por eso pide
// confirmación explícita antes de tocar nada.
//
// Sin --confirmar, solo informa contra qué base y usuario se conectaría, y
// no cambia nada (dry-run informativo).
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import { aplicarMigracionCU04Ronda2 } from './migracionCU04Ronda2.js';
import { informarFalloMigracion } from './utilMigracion.js';

const confirmado = process.argv.includes('--confirmar');

const ejecutar = async () => {
  await sequelize.authenticate();
  const [[fila]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');

  console.log(`Conectado a la base "${fila.base}" como "${fila.usuario}".`);

  if (!confirmado) {
    console.log('\nModo informativo (sin --confirmar): no se modificó nada.');
    console.log('Para aplicar la migración de verdad, volvé a correr con --confirmar:');
    console.log('  node scripts/migrarCU04Ronda2.js --confirmar');
    await sequelize.close();
    return;
  }

  console.log('\nAplicando migración de esquema...');
  await aplicarMigracionCU04Ronda2(sequelize, (linea) => console.log(linea));
  console.log('\nMigración aplicada. Podés reiniciar el backend con normalidad (sync() no tiene');
  console.log('nada nuevo que crear esta ronda: todos los cambios de acá son ALTER, no tablas nuevas).');

  await sequelize.close();
};

ejecutar().catch((error) => {
  informarFalloMigracion(error, {
    script: 'migrarCU04Ronda2.js',
    consultasInspeccion: [
      "SHOW INDEX FROM mediopago WHERE Column_name = 'nombre';",
      "SHOW COLUMNS FROM comprobante LIKE 'estadoCorreo';",
      "SHOW COLUMNS FROM comprobante LIKE '%CompradorHistorico';",
    ],
  });
  process.exit(1);
});
