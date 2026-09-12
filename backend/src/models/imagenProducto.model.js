import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Producto from './producto.model.js';

// Imagen real de un producto (corrección de esta etapa: ver
// docs/frontend-diseno.md, "Imágenes de producto", y
// producto.service.js#prepararUrlImagen). Igual que direccionEntrega.model.js,
// es una tabla NUEVA relacionada, no una columna agregada a `producto`: una
// tabla nueva es segura con sync() (crea lo que falte, sin tocar tablas
// existentes — ver docs/backend-base-de-datos.md), mientras que agregarle
// una columna a `producto` habría requerido una migración manual (ALTER
// TABLE) contra la base de desarrollo, exactamente el error ya cometido y
// corregido una vez con direccionEntrega en esta misma etapa. La relación es
// 1 a 1 opcional: la mayoría de los productos no tiene imagen real cargada
// todavía (no se fabricó ninguna) y usa el ícono por categoría como
// alternativa (ver src/utils/iconoProducto.js en el frontend).
const ImagenProducto = sequelize.define(
  'ImagenProducto',
  {
    idProducto: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    url: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
  },
  {
    tableName: 'imagenproducto',
    timestamps: false,
  },
);

ImagenProducto.belongsTo(Producto, {
  foreignKey: 'idProducto',
  as: 'producto',
});

Producto.hasOne(ImagenProducto, {
  foreignKey: 'idProducto',
  as: 'imagen',
});

export default ImagenProducto;
