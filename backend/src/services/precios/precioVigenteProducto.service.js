import { Op } from 'sequelize';
import PromocionProducto from '../../models/promocionProducto.model.js';
import { validarImportePersistido } from '../../utils/ventaValidaciones.js';
import obtenerFechaArgentina from '../../utils/fechaArgentina.js';
import AppError from '../../errors/AppError.js';

const calcularPrecioVigente = (producto, promocion) => {
  const precioListaCentavos = validarImportePersistido(
    producto.precio,
    `El precio del producto ${producto.nombre} almacenado no es válido`,
  );

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

const promocionesVigentesPara = async (idsProducto, { transaction, instanteEvaluacion } = {}) => {
  if (idsProducto.length === 0) return new Map();

  const fecha = obtenerFechaArgentina(instanteEvaluacion || new Date());
  const opciones = {
    where: {
      idProducto: { [Op.in]: idsProducto },
      fechaInicio: { [Op.lte]: fecha },
      fechaFin: { [Op.gte]: fecha },
    },
    transaction,
  };
  if (transaction) opciones.lock = transaction.LOCK.SHARE;
  const promociones = await PromocionProducto.findAll(opciones);

  const porProducto = new Map();
  for (const promocion of promociones) {
    const existentes = porProducto.get(promocion.idProducto) || [];
    existentes.push(promocion);
    porProducto.set(promocion.idProducto, existentes);
  }

  return porProducto;
};

const presentarProductosConPrecioVigente = async (
  productos,
  opciones = {},
) => {
  const idsProducto = productos.map((producto) => producto.idProducto);
  const promociones = await promocionesVigentesPara(idsProducto, opciones);

  return productos.map((producto) => {
    const productoPlano = typeof producto.get === 'function'
      ? producto.get({ plain: true })
      : producto;
    const promocionesProducto = promociones.get(producto.idProducto) || [];

    if (promocionesProducto.length > 1) {
      throw new AppError(
        `El producto ${producto.nombre} tiene más de una promoción vigente`,
        500,
      );
    }

    return {
      ...productoPlano,
      precioVigente: calcularPrecioVigente(producto, promocionesProducto[0]),
    };
  });
};

const obtenerPreciosVigentesPorId = async (productos, opciones = {}) => {
  const presentados = await presentarProductosConPrecioVigente(productos, opciones);
  return presentados.map(({ idProducto, precioVigente }) => ({
    idProducto,
    precioVigente,
  }));
};

export {
  calcularPrecioVigente,
  presentarProductosConPrecioVigente,
  obtenerPreciosVigentesPorId,
};
