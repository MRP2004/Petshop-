import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Cliente = sequelize.define(
  'Cliente',
  {
    idCliente: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'El nombre del cliente es obligatorio',
        },
        len: {
          args: [2, 50],
          msg: 'El nombre debe contener entre 2 y 50 caracteres',
        },
      },
    },

    apellido: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'El apellido del cliente es obligatorio',
        },
        len: {
          args: [2, 50],
          msg: 'El apellido debe contener entre 2 y 50 caracteres',
        },
      },
    },

    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        isEmail: {
          msg: 'El correo electrónico no es válido',
        },
      },
    },

    direccion: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
  },
  {
    tableName: 'cliente',
    timestamps: false,
  },
);

export default Cliente;