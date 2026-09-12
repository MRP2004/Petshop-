import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from './venta.model.js';

// Domicilio de entrega de una venta (caso de uso "envío a domicilio", ver
// docs/casos-de-uso.md y venta.service.js#prepararEntrega). Tabla NUEVA, no
// una columna agregada a `venta`: agregar una tabla es seguro con sync()
// (crea lo que falte, sin tocar tablas existentes — ver
// docs/backend-base-de-datos.md), mientras que agregarle una columna a
// `venta` habría requerido una migración manual (ALTER TABLE) que no se
// podía ejecutar contra la base de desarrollo en esta etapa. Se prefirió
// este diseño (tabla nueva, relación 1 a 1 opcional) precisamente para no
// depender de esa migración: así el resto de las operaciones sobre Venta
// (listar, cancelar, marcar enviada) siguen funcionando igual que antes,
// tengan o no las bases existentes esta tabla nueva creada todavía.
const DireccionEntrega = sequelize.define(
  'DireccionEntrega',
  {
    idVenta: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    direccion: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
  },
  {
    tableName: 'direccionentrega',
    timestamps: false,
  },
);

DireccionEntrega.belongsTo(Venta, {
  foreignKey: 'idVenta',
  as: 'venta',
});

Venta.hasOne(DireccionEntrega, {
  foreignKey: 'idVenta',
  as: 'direccionEntrega',
});

export default DireccionEntrega;
