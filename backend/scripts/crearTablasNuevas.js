// Crea las tablas NUEVAS que falten (sequelize.sync() sin alter/force, igual
// que server.js al arrancar), pero SIN levantar el servidor HTTP: así, al
// actualizar una base existente, nadie usa la API mientras el esquema está a
// medio migrar. Nunca modifica ni borra tablas existentes.
// Ver docs/actualizacion-base-existente.md para el orden completo.
//
// Uso:
//   cd backend
//   node scripts/crearTablasNuevas.js              (informa y no cambia nada)
//   node scripts/crearTablasNuevas.js --confirmar
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import '../src/models/index.js';

const confirmado = process.argv.includes('--confirmar');

const tablasFaltantes = async () => {
  const [filas] = await sequelize.query(
    'SELECT TABLE_NAME AS nombre FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  );
  const existentes = new Set(filas.map((fila) => fila.nombre.toLowerCase()));
  return Object.values(sequelize.models)
    .map((modelo) => String(modelo.getTableName()).toLowerCase())
    .filter((tabla) => !existentes.has(tabla));
};

const ejecutar = async () => {
  await sequelize.authenticate();
  const [[fila]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');
  console.log(`Conectado a la base "${fila.base}" como "${fila.usuario}".`);

  const faltantes = await tablasFaltantes();
  console.log(faltantes.length ? `Tablas a crear: ${faltantes.join(', ')}` : 'No falta ninguna tabla.');

  if (!confirmado) {
    console.log('\nModo informativo (sin --confirmar): no se modificó nada.');
    await sequelize.close();
    return;
  }

  await sequelize.sync();
  const pendientes = await tablasFaltantes();
  if (pendientes.length) throw new Error(`sync() no creó: ${pendientes.join(', ')}`);
  console.log('\nTablas nuevas creadas (las existentes no se tocaron).');

  // Restaurar un respaldo no borra las tablas creadas después de hacerlo
  // (hallazgo del ensayo y de Codex, Etapa 9): se imprime la sentencia
  // EXACTA para esta base, en vez de que la guía adivine qué tablas eran.
  if (faltantes.length) {
    console.log('\nGuardá esta salida. Solo si después volvés al respaldo, borrá estas tablas con:');
    console.log(`  SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS ${faltantes.join(', ')}; SET FOREIGN_KEY_CHECKS = 1;`);
  }
  await sequelize.close();
};

ejecutar().catch((error) => {
  console.error('\nFALLÓ la creación de tablas nuevas:', error.message);
  console.error('Las tablas ya creadas quedan (CREATE TABLE hace commit implícito); volver a correr es seguro.');
  process.exit(1);
});
