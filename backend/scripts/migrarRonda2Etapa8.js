// Script que Mauro corre UNA vez, a mano, contra su base de desarrollo real
// (petshop_db), para aplicar la Etapa 8 de la ronda 2 (marketplace) sin
// perder datos. Mismo patrón que migrarRonda2Etapa7.js/migrarCU04Ronda2.js.
//
// ORDEN IMPORTANTE (a diferencia de las migraciones anteriores, esta etapa
// agrega tablas NUEVAS —`tienda`, `solicitudvendedor`— Y modifica tablas
// EXISTENTES —`usuario`, `producto`— al mismo tiempo):
//   1. `node scripts/crearTablasNuevas.js --confirmar` (crea `tienda` y
//      `solicitudvendedor` sin levantar el servidor HTTP).
//   2. Recién ENTONCES corré esta migración: agrega la FK de
//      producto.idTienda hacia tienda.idTienda, que no puede crearse si
//      `tienda` todavía no existe (el script lo detecta y aborta con un
//      mensaje claro si corrés esto primero, ver migracionRonda2Etapa8.js).
// Orden completo de todas las migraciones pendientes, respaldo y
// recuperación: docs/actualizacion-base-existente.md.
//
// Uso:
//   cd backend
//   node scripts/migrarRonda2Etapa8.js --confirmar
//
// Sin --confirmar, solo informa contra qué base y usuario se conectaría, y
// no cambia nada (dry-run informativo).
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import { aplicarMigracionRonda2Etapa8 } from './migracionRonda2Etapa8.js';
import { informarFalloMigracion } from './utilMigracion.js';

const confirmado = process.argv.includes('--confirmar');

const ejecutar = async () => {
  await sequelize.authenticate();
  const [[fila]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');

  console.log(`Conectado a la base "${fila.base}" como "${fila.usuario}".`);

  if (!confirmado) {
    console.log('\nModo informativo (sin --confirmar): no se modificó nada.');
    console.log('Para aplicar la migración de verdad, volvé a correr con --confirmar:');
    console.log('  node scripts/migrarRonda2Etapa8.js --confirmar');
    await sequelize.close();
    return;
  }

  console.log('\nAplicando migración Ronda 2, Etapa 8 (marketplace)...');
  await aplicarMigracionRonda2Etapa8(sequelize, (linea) => console.log(linea));
  console.log('\nMigración aplicada. Confirmá el resultado con: node scripts/verificarEsquemaActual.js');

  await sequelize.close();
};

ejecutar().catch((error) => {
  informarFalloMigracion(error, {
    script: 'migrarRonda2Etapa8.js',
    consultasInspeccion: [
      "SHOW COLUMNS FROM usuario LIKE 'rol';",
      "SHOW COLUMNS FROM producto LIKE 'idTienda';",
      "SHOW TABLES LIKE 'tienda';",
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'producto' AND REFERENCED_TABLE_NAME = 'tienda';",
    ],
  });
  process.exit(1);
});
