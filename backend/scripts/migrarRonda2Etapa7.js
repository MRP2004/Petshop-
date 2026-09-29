// Script que Mauro corre UNA vez, a mano, contra su base de desarrollo real
// (petshop_db), para aplicar la Etapa 7 de la ronda 2 (estados de pedido)
// sin perder datos. Mismo patrón que migrarCU04Ronda2.js.
//
// Uso:
//   cd backend
//   node scripts/migrarRonda2Etapa7.js --confirmar
//
// Sin --confirmar, solo informa contra qué base y usuario se conectaría, y
// no cambia nada (dry-run informativo).
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import { aplicarMigracionRonda2Etapa7 } from './migracionRonda2Etapa7.js';
import { informarFalloMigracion } from './utilMigracion.js';

const confirmado = process.argv.includes('--confirmar');

const ejecutar = async () => {
  await sequelize.authenticate();
  const [[fila]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');

  console.log(`Conectado a la base "${fila.base}" como "${fila.usuario}".`);

  if (!confirmado) {
    console.log('\nModo informativo (sin --confirmar): no se modificó nada.');
    console.log('Para aplicar la migración de verdad, volvé a correr con --confirmar:');
    console.log('  node scripts/migrarRonda2Etapa7.js --confirmar');
    await sequelize.close();
    return;
  }

  console.log('\nAplicando migración Ronda 2, Etapa 7 (estados de pedido)...');
  await aplicarMigracionRonda2Etapa7(sequelize, (linea) => console.log(linea));
  console.log('\nMigración aplicada. Podés reiniciar el backend con normalidad (sync() no tiene');
  console.log('nada nuevo que crear esta etapa: el único cambio de acá es un ALTER, no una tabla nueva).');

  await sequelize.close();
};

ejecutar().catch((error) => {
  informarFalloMigracion(error, {
    script: 'migrarRonda2Etapa7.js',
    consultasInspeccion: ["SHOW COLUMNS FROM venta LIKE 'estado';"],
  });
  process.exit(1);
});
