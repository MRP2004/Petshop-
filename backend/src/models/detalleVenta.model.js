import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from './venta.model.js';
import Producto from './producto.model.js';

const DetalleVenta = sequelize.define(
  'DetalleVenta',
  {
    idDetalleVenta: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    precioUnitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    idVenta: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    idProducto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'detalleventa',
    timestamps: false,
  },
);

DetalleVenta.belongsTo(Venta, {
  foreignKey: 'idVenta',
  as: 'venta',
});

Venta.hasMany(DetalleVenta, {
  foreignKey: 'idVenta',
  as: 'detalles',
});

DetalleVenta.belongsTo(Producto, {
  foreignKey: 'idProducto',
  as: 'producto',
});

Producto.hasMany(DetalleVenta, {
  foreignKey: 'idProducto',
  as: 'detallesVenta',
});

export default DetalleVenta;