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

    // Único (revisión de diseño, Codex — CU-04, ronda de correcciones):
    // compra.service.js resuelve el medio de pago simulado buscando por
    // este nombre con SELECT...FOR UPDATE; sin una restricción única real en
    // la base, esa búsqueda no tiene un índice claro para bloquear (podría
    // recorrer la tabla entera) y, si alguna vez existieran dos filas con el
    // mismo nombre, cuál de las dos se bloquea/lee quedaría indefinido. Una
    // base existente con nombres ya duplicados necesita resolverlos antes de
    // poder aplicar esta restricción (ver migración en
    // scripts/migrarCU04Ronda2.js).
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
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