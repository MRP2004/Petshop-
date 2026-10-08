import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Producto from './producto.model.js';

// Coincide exactamente con la tabla `promocionproducto` que ya existía en
// la base de desarrollo (huérfana: sin modelo/servicio/ruta previos, ver
// docs/backend-base-de-datos.md). Se reutiliza esa tabla en vez de crear una
// nueva, para no dejar dos esquemas de promoción distintos conviviendo.
//
// Las reglas de aplicación están documentadas en
// docs/promociones.md: porcentaje sobre un producto, con vigencia inclusiva.
const PromocionProducto = sequelize.define(
  'PromocionProducto',
  {
    idPromocionProducto: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    fechaInicio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    fechaFin: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    descuento: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },

    idProducto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'promocionproducto',
    timestamps: false,
  },
);

PromocionProducto.belongsTo(Producto, {
  foreignKey: 'idProducto',
  as: 'producto',
});

Producto.hasMany(PromocionProducto, {
  foreignKey: 'idProducto',
  as: 'promociones',
});

export default PromocionProducto;
