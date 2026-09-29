import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Cliente from './cliente.model.js';
import Venta from './venta.model.js';

// Clave de idempotencia de un intento de compra (CU-04). Tabla nueva, no
// relacionada 1 a 1 con Venta: un intento puede resolverse SIN crear una
// venta (pago rechazado), y una venta creada por la carga manual del
// personal nunca tiene intento asociado.
//
// La restricción única real vive en la base (unique: 'clave_por_cliente'
// sobre claveIdempotencia+idCliente, no solo en el modelo): es la que
// garantiza, ante dos solicitudes simultáneas con la misma clave, que como
// máximo una llegue a insertar la fila — ver compra.service.js para el
// patrón de bloqueo completo (INSERT ... ON DUPLICATE KEY UPDATE seguido de
// SELECT ... FOR UPDATE).
//
// hashContenido NUNCA incluye ningún dato de pago (ni el tipo, ni el número
// de tarjeta, ni el código de seguridad, ver pagoSimulado.service.js): solo
// los detalles comerciales (productos, cantidades, entrega) — ver
// compra.service.js#calcularHashContenido para el motivo (recuperarse de
// una respuesta perdida no debe depender de que el formulario de pago se
// haya reiniciado igual). Reintentar la misma clave con otro producto, otra
// cantidad, u otra entrega se rechaza comparando este hash; reintentarla con
// otro medio de pago u otra tarjeta, no.
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

    // 'procesando': fila recién insertada, la transacción que la creó
    // todavía no terminó (ver compra.service.js — si esa transacción se
    // revierte o el proceso se cae, la fila desaparece con ella: un reintento
    // posterior la ve como si nunca hubiera existido, lo que permite
    // recuperarse de una respuesta perdida o de una caída a mitad de camino).
    estado: {
      type: DataTypes.ENUM('procesando', 'aprobado', 'rechazado'),
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
