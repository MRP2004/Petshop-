import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MedioPago = sequelize.define(
  'MedioPago',
  {
    idMedioPago: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'El nombre del medio de pago es obligatorio',
        },
        len: {
          args: [2, 50],
          msg: 'El nombre debe contener entre 2 y 50 caracteres',
        },
      },
    },

    descripcion: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    habilitado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'mediopago',
    timestamps: false,
  },
);

export default MedioPago;