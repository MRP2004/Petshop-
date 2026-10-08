import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import DetalleVenta from './detalleVenta.model.js';

// Desglose histórico de precio/promoción de un detalle de venta (CU-04):
// precio de lista, descuento y promoción aplicada AL MOMENTO de la compra.
// Tabla nueva 1 a 1 con DetalleVenta (mismo motivo que pago.model.js/
// comprobante.model.js: sync() no altera `detalleventa`, que ya existía).
// DetalleVenta.precioUnitario/subtotal (columnas existentes, sin tocar)
// siguen siendo el precio FINAL unitario y el subtotal, para no romper el
// contrato ya usado por la carga manual del personal. Las líneas con una
// promoción guardan su desglose tanto en el checkout como en la carga manual.
//
// idPromocionProducto es una referencia informativa, no una FK con
// integridad referencial: si la promoción se edita o se borra más adelante,
// este registro histórico (nombre del producto, precio de lista, porcentaje
// y monto de descuento ya calculados) no debe cambiar ni desaparecer — por
// eso se guardan los valores calculados, no solo el ID.
const DetalleVentaPromocion = sequelize.define(
  'DetalleVentaPromocion',
  {
    idDetalleVenta: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },

    // Nombre del producto al momento de comprar: si el producto se renombra
    // o se elimina después, el comprobante ya emitido no cambia.
    nombreProductoHistorico: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },

    precioListaUnitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    idPromocionProducto: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    porcentajeDescuento: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },

    montoDescuentoUnitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'detalleventapromocion',
    timestamps: false,
  },
);

DetalleVentaPromocion.belongsTo(DetalleVenta, {
  foreignKey: 'idDetalleVenta',
  as: 'detalleVenta',
});

DetalleVenta.hasOne(DetalleVentaPromocion, {
  foreignKey: 'idDetalleVenta',
  as: 'promocionAplicada',
});

export default DetalleVentaPromocion;
