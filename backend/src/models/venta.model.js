import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';
import MedioPago from './medioPago.model.js';

const Venta = sequelize.define(
  'Venta',
  {
    idVenta: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    // Ronda 2, Etapa 7 (estados de pedido): 2 valores nuevos, aditivos —
    // ver backend/scripts/migracionRonda2Etapa7.js. `'enviada'` queda como
    // el estado legado/operativo de "despachada" para ventas con
    // `metodoEntrega='envío a domicilio'` (o método legado desconocido, ver
    // venta.service.js#marcarVentaComoEnviada); `'lista_para_retirar'` es
    // su equivalente para retiro en sucursal. `'entregada'` es el único
    // estado final real (retirado o entregado a domicilio, confirmado por
    // el personal) — se llega a él desde CUALQUIERA de los dos anteriores,
    // nunca directo desde 'registrada' (revisión de diseño, Codex: "evita
    // saltear el hito operativo intermedio").
    estado: {
      type: DataTypes.ENUM(
        'registrada',
        'cancelada',
        'enviada',
        'lista_para_retirar',
        'entregada',
      ),
      allowNull: false,
      defaultValue: 'registrada',
    },

    metodoEntrega: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    minimoMayorista: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    descuento: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    idCliente: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    idMedioPago: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'venta',
    timestamps: false,
  },
);

Venta.belongsTo(Cliente, {
  foreignKey: 'idCliente',
  as: 'cliente',
});

Cliente.hasMany(Venta, {
  foreignKey: 'idCliente',
  as: 'ventas',
});

Venta.belongsTo(MedioPago, {
  foreignKey: 'idMedioPago',
  as: 'medioPago',
});

MedioPago.hasMany(Venta, {
  foreignKey: 'idMedioPago',
  as: 'ventas',
});

export default Venta;