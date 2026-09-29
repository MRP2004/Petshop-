// Script que Mauro corre UNA vez, a mano, contra su base de desarrollo real
// (petshop_db), para aplicar la ronda 2 de correcciones de CU-04 sin perder
// datos. Ver docs/cu04-checkout-pago.md, "Actualizar el entorno existente",
// para el procedimiento completo con el resto de los pasos (npm install,
// reinicio del backend).
//
// A diferencia de los scripts de test-integracion/ o
// verificarMigracionCU04.js, este NO restringe DB_NAME a "petshop_test": su
// propósito es correr justamente contra la base de desarrollo real, leyendo
// la configuración de .env tal cual la tiene Mauro. Por eso pide
// confirmación explícita antes de tocar nada.
//
// Uso:
//   cd backend
//   node scripts/migrarCU04Ronda2.js --confirmar
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

  console.log('\nAplicando migración CU-04, ronda 2...');
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
