import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from './venta.model.js';

// Solicitud de cancelación de un cliente sobre su propia compra (CU-04,
// corrección — revisión de Mauro sobre la venta #20): desde esta corrección,
// el cliente ya NO puede cancelar directamente (ver
// venta.service.js#cancelarVenta); en su lugar, pide la cancelación y queda
// registrada acá para que el personal la apruebe o la rechace. Tabla nueva,
// independiente de `venta` (relación 1 a N: una venta puede tener más de una
// solicitud a lo largo del tiempo — por ejemplo, una rechazada y, después,
// una nueva), a diferencia de pago/comprobante (1 a 1, ver esos modelos).
//
// Aprobar una solicitud NO es una lógica de cancelación propia: reutiliza
// venta.service.js#ejecutarCancelacionTransaccional, la MISMA que usa la
// cancelación directa del personal (ver solicitudCancelacion.service.js) —
// nunca dos formas distintas de cancelar una venta.
const SolicitudCancelacion = sequelize.define(
  'SolicitudCancelacion',
  {
    idSolicitud: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    idVenta: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // 'pendiente' → 'aprobada' | 'rechazada'. Una vez resuelta, nunca vuelve
    // a 'pendiente' ni se decide dos veces (ver
    // solicitudCancelacion.service.js#resolverSolicitudCancelacion, que
    // bloquea la fila y comprueba este valor antes de aplicar cualquier
    // decisión).
    estado: {
      type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada'),
      allowNull: false,
      defaultValue: 'pendiente',
    },

    // Motivo opcional que el personal puede dejar al RECHAZAR (para que el
    // cliente entienda por qué). No aplica a una aprobación (esa la
    // resuelve la propia cancelación, visible como venta.estado).
    motivoRechazo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    creadoEn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // NULL mientras está 'pendiente'; se completa junto con la decisión.
    resueltoEn: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Quién decidió (vendedor/administrador) — auditoría mínima, no se
    // valida contra Usuario con una FK (igual criterio que otros campos de
    // auditoría "quién" de este proyecto: el id ya viene verificado por la
    // sesión, no hace falta una relación formal para esto).
    idUsuarioResolvio: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'solicitudcancelacion',
    timestamps: false,
  },
);

SolicitudCancelacion.belongsTo(Venta, {
  foreignKey: 'idVenta',
  as: 'venta',
});

Venta.hasMany(SolicitudCancelacion, {
  foreignKey: 'idVenta',
  as: 'solicitudesCancelacion',
});

export default SolicitudCancelacion;
