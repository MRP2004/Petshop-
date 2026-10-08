// Verificación de SOLO LECTURA del esquema de una base contra lo que espera el
// código actual (todas las migraciones manuales acumuladas). No modifica
// nada: solo consulta INFORMATION_SCHEMA. Sirve para saber qué falta ANTES
// de actualizar y para confirmar el resultado DESPUÉS.
// Ver docs/actualizacion-base-existente.md.
//
// Uso:
//   cd backend
//   node scripts/verificarEsquemaActual.js
// Sale con código 0 si todo está al día, 1 si falta algo.
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import '../src/models/index.js';
import { ENUM_FINAL as ENUM_ESTADO_CORREO } from './migracionCU04Ronda2.js';
import { ENUM_FINAL as ENUM_ESTADO_VENTA } from './migracionRonda2Etapa7.js';
import { ENUM_ROL_FINAL } from './migracionRonda2Etapa8.js';

const consultar = async (sql) => (await sequelize.query(sql))[0];

const tipoColumna = async (tabla, columna) =>
  (
    await consultar(
      `SELECT COLUMN_TYPE AS tipo, IS_NULLABLE AS nullable FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tabla}' AND COLUMN_NAME = '${columna}'`,
    )
  )[0] || null;

const ejecutar = async () => {
  await sequelize.authenticate();
  const [[fila]] = await sequelize.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario');
  console.log(`Base "${fila.base}" (usuario "${fila.usuario}") — verificación de solo lectura.\n`);

  const resultados = [];
  const chequear = (paso, descripcion, ok, detalle = '') => resultados.push({ paso, descripcion, ok, detalle });

  const tablas = new Set(
    (await consultar('SELECT TABLE_NAME AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()')).map((f) =>
      f.n.toLowerCase(),
    ),
  );
  const faltantes = Object.values(sequelize.models)
    .map((modelo) => String(modelo.getTableName()).toLowerCase())
    .filter((tabla) => !tablas.has(tabla));
  chequear('crearTablasNuevas.js', 'Todas las tablas de los modelos existen', faltantes.length === 0, faltantes.join(', '));

  if (tablas.has('mediopago')) {
    const indices = await consultar(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'mediopago' AND COLUMN_NAME = 'nombre' AND NON_UNIQUE = 0`,
    );
    chequear('migrarCU04Ronda2.js', 'Índice único en mediopago.nombre', indices.length > 0);
  }

  if (tablas.has('comprobante')) {
    const estadoCorreo = await tipoColumna('comprobante', 'estadoCorreo');
    chequear('migrarCU04Ronda2.js', 'ENUM final de comprobante.estadoCorreo', estadoCorreo?.tipo === ENUM_ESTADO_CORREO, estadoCorreo?.tipo);
    for (const columna of ['nombreCompradorHistorico', 'apellidoCompradorHistorico', 'correoCompradorHistorico']) {
      chequear('migrarCU04Ronda2.js', `Columna comprobante.${columna}`, Boolean(await tipoColumna('comprobante', columna)));
    }
  }

  const estadoVenta = await tipoColumna('venta', 'estado');
  chequear('migrarRonda2Etapa7.js', 'ENUM final de venta.estado', estadoVenta?.tipo === ENUM_ESTADO_VENTA, estadoVenta?.tipo);

  const rol = await tipoColumna('usuario', 'rol');
  chequear('migrarRonda2Etapa8.js', 'ENUM final de usuario.rol', rol?.tipo === ENUM_ROL_FINAL, rol?.tipo);

  const idTienda = await tipoColumna('producto', 'idTienda');
  chequear(
    'migrarRonda2Etapa8.js',
    'Columna producto.idTienda (int, NULL)',
    idTienda?.tipo === 'int' && idTienda?.nullable === 'YES',
    idTienda ? `${idTienda.tipo}, nullable=${idTienda.nullable}` : 'no existe',
  );

  const fk = await consultar(
    `SELECT CONSTRAINT_NAME AS nombre FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'producto' AND COLUMN_NAME = 'idTienda' AND REFERENCED_TABLE_NAME = 'tienda'`,
  );
  chequear('migrarRonda2Etapa8.js', 'FK producto.idTienda → tienda.idTienda', fk.length === 1, fk.map((f) => f.nombre).join(', '));

  if (tablas.has('promocionproducto')) {
    const categoriaPromocion = await tipoColumna('promocionproducto', 'idCategoria');
    chequear(
      'migrarPromociones.js',
      'Columna promocionproducto.idCategoria eliminada',
      categoriaPromocion === null,
      categoriaPromocion ? 'todavía existe' : '',
    );
  }

  for (const r of resultados) {
    console.log(`${r.ok ? 'OK       ' : 'PENDIENTE'}  [${r.paso}] ${r.descripcion}${r.detalle && !r.ok ? ` — actual: ${r.detalle}` : ''}`);
  }

  const pendientes = resultados.filter((r) => !r.ok);
  console.log(pendientes.length ? `\n${pendientes.length} punto(s) pendiente(s).` : '\nEsquema al día con el código actual.');
  await sequelize.close();
  process.exitCode = pendientes.length ? 1 : 0;
};

ejecutar().catch((error) => {
  console.error('\nNo se pudo verificar el esquema:', error.message);
  process.exit(1);
});
