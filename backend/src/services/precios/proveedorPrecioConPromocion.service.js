import { Op } from 'sequelize';
import PromocionProducto from '../../models/promocionProducto.model.js';
import { validarImportePersistido } from '../../utils/ventaValidaciones.js';
import obtenerFechaArgentina from '../../utils/fechaArgentina.js';
import AppError from '../../errors/AppError.js';

const obtenerPrecioVigente = async (producto, contexto = {}) => {
  const precioListaCentavos = validarImportePersistido(
    producto.precio,
    `El precio del producto ${producto.nombre} almacenado no es válido`,
  );
  const fecha = obtenerFechaArgentina(contexto.instanteEvaluacion || new Date());
  const opciones = {
    where: {
      idProducto: producto.idProducto,
      fechaInicio: { [Op.lte]: fecha },
      fechaFin: { [Op.gte]: fecha },
    },
    transaction: contexto.transaction,
  };

  if (contexto.transaction) {
    opciones.lock = contexto.transaction.LOCK.SHARE;
  }

  const promociones = await PromocionProducto.findAll(opciones);

  if (promociones.length > 1) {
    throw new AppError(
      `El producto ${producto.nombre} tiene más de una promoción vigente`,
      500,
    );
  }

  const promocion = promociones[0];

  if (!promocion) {
    return {
      precioListaCentavos,
      idPromocionProducto: null,
      porcentajeDescuento: 0,
      montoDescuentoCentavos: 0,
      precioFinalCentavos: precioListaCentavos,
    };
  }

  const porcentajeDescuento = Number(promocion.descuento);
  const porcentajeEnCentimos = BigInt(Math.round(porcentajeDescuento * 100));
  const montoDescuentoCentavos = Number(
    (BigInt(precioListaCentavos) * porcentajeEnCentimos + 5000n) / 10000n,
  );

  return {
    precioListaCentavos,
    idPromocionProducto: promocion.idPromocionProducto,
    porcentajeDescuento,
    montoDescuentoCentavos,
    precioFinalCentavos: precioListaCentavos - montoDescuentoCentavos,
  };
};

export default obtenerPrecioVigente;
