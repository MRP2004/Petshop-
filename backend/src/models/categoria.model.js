import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Categoria = sequelize.define(
  'Categoria',
  {
    idCategoria: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'El nombre de la categoría es obligatorio',
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
      validate: {
        len: {
          args: [0, 150],
          msg: 'La descripción no puede superar los 150 caracteres',
        },
      },
    },
  },
  {
    tableName: 'categoria',
    timestamps: false,
  },
);

export default Categoria;