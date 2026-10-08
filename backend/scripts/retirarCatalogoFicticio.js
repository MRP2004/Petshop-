// Retira exclusivamente los 1000 productos de la carga ficticia de catálogo.
// Conserva tipos/subtipos de mascotas, jerarquías, categorías y datos reales.
import 'dotenv/config';
import { Op } from 'sequelize';
import sequelize from '../src/config/database.js';
import '../src/models/index.js';
import Producto from '../src/models/producto.model.js';
import DetalleVenta from '../src/models/detalleVenta.model.js';
import PromocionProducto from '../src/models/promocionProducto.model.js';
import FacetaProducto from '../src/models/facetaProducto.model.js';
import ImagenProducto from '../src/models/imagenProducto.model.js';
import Favorito from '../src/models/favorito.model.js';

const inicioDescripcion = 'Artículo ficticio de demostración para ';
const patronSerie = / serie (\d{4})$/u;

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
  const confirmar = process.argv.includes('--confirmar');
  await sequelize.transaction(async (transaction) => {
    const productos = await Producto.findAll({
      where: { descripcion: { [Op.like]: `${inicioDescripcion}%` }, idTienda: null },
      attributes: ['idProducto', 'nombre', 'descripcion'],
      order: [['idProducto', 'ASC']], transaction,
      ...(confirmar ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    // El marcador por sí solo no basta: deben estar las 1000 series exactas.
    const series = productos.map((producto) => {
      if (!producto.descripcion.startsWith(inicioDescripcion)) return NaN;
      const coincidencia = producto.nombre.match(patronSerie);
      return coincidencia ? Number(coincidencia[1]) : NaN;
    }).sort((a, b) => a - b);
    if (productos.length !== 1000 || series.some((serie, indice) => serie !== indice + 1)) {
      throw new Error(`Se esperaban las series 0001–1000, se hallaron ${productos.length} artículos compatibles. No se modificó nada`);
    }
    const ids = productos.map((producto) => producto.idProducto);
    const detalles = await DetalleVenta.count({ where: { idProducto: { [Op.in]: ids } }, transaction });
    const promociones = await PromocionProducto.count({ where: { idProducto: { [Op.in]: ids } }, transaction });
    const favoritos = await Favorito.count({ where: { idProducto: { [Op.in]: ids } }, transaction });
    console.log(`Productos ficticios: ${productos.length}; detalles de venta: ${detalles}; promociones: ${promociones}; favoritos: ${favoritos}.`);
    if (detalles || promociones) {
      throw new Error('Hay ventas o promociones vinculadas a los artículos ficticios. No se borró nada; conservá esta salida para revisar esos vínculos');
    }
    if (!confirmar) {
      console.log('Modo informativo: no se modificó nada. Para retirar los artículos, repetí con --confirmar.');
      return;
    }

    await ImagenProducto.destroy({ where: { idProducto: { [Op.in]: ids } }, transaction });
    await FacetaProducto.destroy({ where: { idProducto: { [Op.in]: ids } }, transaction });
    await Favorito.destroy({ where: { idProducto: { [Op.in]: ids } }, transaction });
    const borrados = await Producto.destroy({ where: { idProducto: { [Op.in]: ids } }, transaction });
    if (borrados !== 1000) throw new Error(`Se borraron ${borrados} de 1000 artículos; se revierte la transacción`);
    console.log('1000 artículos ficticios retirados. Tipos y subtipos de mascotas conservados.');
  });
};

ejecutar().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
