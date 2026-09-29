import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Venta from './venta.model.js';

// Pago simulado del checkout de cliente (CU-04). Igual que
// direccionEntrega.model.js/imagenProducto.model.js: tabla NUEVA con la
// venta como clave primaria (relación 1 a 1), no una columna agregada a
// `venta` — sync() crea tablas nuevas sin tocar las existentes, agregar una
// columna a `venta` sí habría requerido una migración manual (ver
// docs/backend-base-de-datos.md). Solo existe cuando la venta se originó en
// el checkout con pago simulado: una venta cargada manualmente por el
// personal (venta.service.js#registrarVenta) no tiene fila acá, y así debe
// mostrarse (sin inventar un "aprobado_simulado" que nunca ocurrió).
const Pago = sequelize.define(
  'Pago',
  {
    idVenta: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    // 'transferencia' y 'debito' son los únicos dos medios simulados de esta
    // etapa (ver pagoSimulado.service.js). No hay pasarela real: ninguno de
    // los dos mueve dinero de verdad.
    tipo: {
      type: DataTypes.ENUM('transferencia', 'debito'),
      allowNull: false,
    },

    // Estado del PAGO, separado del estado del PEDIDO (Venta.estado): un
    // pago rechazado nunca llega a crear una Venta (ver compra.service.js),
    // así que en la práctica esta columna solo toma 'aprobado_simulado' (al
    // confirmar) o 'revertido_simulado' (al cancelar la venta). El valor
    // 'rechazado_simulado' se registra en IntentoCompra, no acá.
    estado: {
      type: DataTypes.ENUM(
        'aprobado_simulado',
        'rechazado_simulado',
        'revertido_simulado',
      ),
      allowNull: false,
    },

    // Últimos 4 dígitos y marca SOLO para mostrar en el comprobante ("Débito
    // terminada en 0002"); nunca el número completo ni el código de
    // seguridad, que ni siquiera llegan a esta capa (ver
    // pagoSimulado.service.js). Null para transferencia (no aplica).
    ultimosCuatroDigitos: {
      type: DataTypes.STRING(4),
      allowNull: true,
    },

    marca: {
      type: DataTypes.STRING(30),
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
