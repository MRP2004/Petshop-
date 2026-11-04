
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from './venta.model.js';

const Pago = sequelize.define(
  'Pago',
  {
    idVenta: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    // Medio utilizado para realizar el pago.
    tipo: {
      type: DataTypes.ENUM(
        'transferencia',
        'debito',
        'mercado_pago',
      ),
      allowNull: false,
    },

    // Los pagos simulados conservan sus estados originales.
    // Mercado Pago utiliza 'aprobado' cuando la operación
    // fue verificada directamente contra su API.
    estado: {
      type: DataTypes.ENUM(
        'aprobado_simulado',
        'rechazado_simulado',
        'revertido_simulado',
        'aprobado',
      ),
      allowNull: false,
    },

    ultimosCuatroDigitos: {
      type: DataTypes.STRING(4),
      allowNull: true,
    },

    marca: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    // Identificador de la operación en Mercado Pago.
    // Es null para los pagos simulados.
    idPagoMercadoPago: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    monto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'pago',
    timestamps: false,
  },
);

Pago.belongsTo(Venta, {
  foreignKey: 'idVenta',
  as: 'venta',
});

Venta.hasOne(Pago, {
  foreignKey: 'idVenta',
  as: 'pago',
});

export default Pago;
