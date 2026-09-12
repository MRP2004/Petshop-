import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';
import MedioPago from './medioPago.model.js';

const Venta = sequelize.define(
  'Venta',
  {
    idVenta: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    estado: {
      type: DataTypes.ENUM(
        'registrada',
        'cancelada',
        'enviada',
      ),
      allowNull: false,
      defaultValue: 'registrada',
    },

    metodoEntrega: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    minimoMayorista: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    descuento: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    idCliente: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    idMedioPago: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'venta',
    timestamps: false,
  },
);

Venta.belongsTo(Cliente, {
  foreignKey: 'idCliente',
  as: 'cliente',
});

Cliente.hasMany(Venta, {
  foreignKey: 'idCliente',
  as: 'ventas',
});

Venta.belongsTo(MedioPago, {
  foreignKey: 'idMedioPago',
  as: 'medioPago',
});

MedioPago.hasMany(Venta, {
  foreignKey: 'idMedioPago',
  as: 'ventas',
});

export default Venta;