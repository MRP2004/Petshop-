// Completa únicamente tipos y subtipos de mascotas en la base de desarrollo.
// No agrega productos, marcas, categorías ni cuentas ficticias.
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import '../src/models/index.js';
import TipoMascota from '../src/models/tipoMascota.model.js';
import JerarquiaMascota from '../src/models/jerarquiaMascota.model.js';

const grupos = [
  { nombre: 'Perro', subtipos: [] },
  { nombre: 'Gato', subtipos: [] },
  { nombre: 'Ave', subtipos: ['Periquito', 'Canario', 'Ninfa'] },
  { nombre: 'Pequeños mamíferos', subtipos: ['Conejo', 'Hámster', 'Cobayo', 'Hurón'] },
  { nombre: 'Pez', subtipos: ['Goldfish', 'Betta', 'Guppy', 'Pez payaso'] },
  { nombre: 'Reptil', subtipos: ['Tortuga de agua', 'Gecko', 'Iguana'] },
];

const ejecutar = async () => {
  if (process.env.DB_NAME !== 'petshop_db' || process.env.DB_USER !== 'petshop_app') {
    throw new Error('Se requiere DB_NAME=petshop_db y DB_USER=petshop_app');
  }
  await sequelize.authenticate();
  const [[conexion]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');
  console.log(`Base efectiva: ${conexion.base}; usuario: ${conexion.usuario}`);
  if (conexion.base !== 'petshop_db' || !/^petshop_app@localhost$/i.test(conexion.usuario)) {
    throw new Error('La conexión efectiva debe ser petshop_db con petshop_app@localhost');
  }
  if (!process.argv.includes('--confirmar')) {
    console.log('Modo informativo: no se modificó nada. Se crearán solo tipos, subtipos y su jerarquía faltantes.');
    return;
  }
  const agregados = await sequelize.transaction(async (transaction) => {
    let tipos = 0;
    let relaciones = 0;
    for (const grupo of grupos) {
      const [padre, nuevoPadre] = await TipoMascota.findOrCreate({ where: { nombre: grupo.nombre }, transaction });
      if (nuevoPadre) tipos += 1;
      for (const nombre of grupo.subtipos) {
        const [hijo, nuevoHijo] = await TipoMascota.findOrCreate({ where: { nombre }, transaction });
        if (nuevoHijo) tipos += 1;
        const [, nuevaRelacion] = await JerarquiaMascota.findOrCreate({
          where: { idTipoPadre: padre.idTipoMascota, idTipoHijo: hijo.idTipoMascota }, transaction,
        });
        if (nuevaRelacion) relaciones += 1;
      }
    }
    return { tipos, relaciones };
  });
  console.log(`Tipos agregados: ${agregados.tipos}; relaciones agregadas: ${agregados.relaciones}. No se tocaron productos.`);
};

ejecutar().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
