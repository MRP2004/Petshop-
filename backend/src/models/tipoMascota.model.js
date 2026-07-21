import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TipoMascota = sequelize.define(
  'TipoMascota',
  {
    idTipoMascota: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'El nombre del tipo de mascota es obligatorio',
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
  },
  {
    tableName: 'tipomascota',
    timestamps: false,
  },
);

export default TipoMascota;