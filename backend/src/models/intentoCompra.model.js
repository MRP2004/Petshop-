import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';
import Venta from './venta.model.js';

const IntentoCompra = sequelize.define(
  'IntentoCompra',
  {
    idIntentoCompra: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    claveIdempotencia: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: 'clave_por_cliente',
    },

    idCliente: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: 'clave_por_cliente',
    },

    hashContenido: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },

    estado: {
      type: DataTypes.ENUM(
        'procesando',
        'pendiente_pago',
        'aprobado',
        'rechazado',
      ),
      allowNull: false,
      defaultValue: 'procesando',
    },

    idVenta: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    motivoRechazo: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    // Datos comerciales necesarios para reconstruir la compra
    // cuando llegue la notificación de Mercado Pago.
    datosCompra: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // Identificadores externos de Checkout Pro.
    idPreferenciaMercadoPago: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    idPagoMercadoPago: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    creadoEn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    actualizadoEn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'intentocompra',
    timestamps: false,
  },
);

IntentoCompra.belongsTo(Cliente, {
  foreignKey: 'idCliente',
  as: 'cliente',
});

IntentoCompra.belongsTo(Venta, {
  foreignKey: 'idVenta',
  as: 'venta',
});

export default IntentoCompra;