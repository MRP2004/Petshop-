import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Proveedor = sequelize.define(
  'Proveedor',
  {
    idProveedor: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    descripcion: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'La descripción del proveedor es obligatoria',
        },
        len: {
          args: [2, 100],
          msg: 'La descripción debe contener entre 2 y 100 caracteres',
        },
      },
    },

    direccion: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    CUIT: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    mail: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        isEmail: {
          msg: 'El correo electrónico no es válido',
        },
      },
    },
  },
  {
    tableName: 'proveedor',
    timestamps: false,
  },
);

export default Proveedor;