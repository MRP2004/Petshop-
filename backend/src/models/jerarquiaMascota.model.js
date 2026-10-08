import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import TipoMascota from './tipoMascota.model.js';

// Relación padre → subtipo sin alterar las filas ya existentes de tipomascota.
// Ejemplo: Ave → Periquito. Un producto apunta al tipo más específico que
// corresponda mediante su idTipoMascota actual.
const JerarquiaMascota = sequelize.define(
  'JerarquiaMascota',
  {
    idTipoPadre: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: TipoMascota, key: 'idTipoMascota' },
    },
    idTipoHijo: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      unique: true,
      references: { model: TipoMascota, key: 'idTipoMascota' },
    },
  },
  { tableName: 'jerarquiamascota', timestamps: false },
);

JerarquiaMascota.belongsTo(TipoMascota, { foreignKey: 'idTipoPadre', as: 'padre' });
JerarquiaMascota.belongsTo(TipoMascota, { foreignKey: 'idTipoHijo', as: 'hijo' });

export default JerarquiaMascota;
