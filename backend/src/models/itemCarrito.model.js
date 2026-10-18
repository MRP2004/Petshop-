import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Usuario from './usuario.model.js';
import Producto from './producto.model.js';

const ItemCarrito = sequelize.define(
  'ItemCarrito',
  {
    idItemCarrito: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    idUsuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    idProducto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
  },
  {
    tableName: 'itemcarrito',
    timestamps: true,
    createdAt: 'creadoEn',
    updatedAt: 'actualizadoEn',
    indexes: [
      {
        unique: true,
        fields: ['idUsuario', 'idProducto'],
      },
    ],
  },
);

ItemCarrito.belongsTo(Usuario, {
  foreignKey: 'idUsuario',
  as: 'usuario',
  onDelete: 'CASCADE',
});

Usuario.hasMany(ItemCarrito, {
  foreignKey: 'idUsuario',
  as: 'itemsCarrito',
  onDelete: 'CASCADE',
});

ItemCarrito.belongsTo(Producto, {
  foreignKey: 'idProducto',
  as: 'producto',
  onDelete: 'CASCADE',
});

Producto.hasMany(ItemCarrito, {
  foreignKey: 'idProducto',
  as: 'itemsCarrito',
  onDelete: 'CASCADE',
});

export default ItemCarrito;
