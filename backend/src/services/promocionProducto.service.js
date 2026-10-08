import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import PromocionProducto from '../models/promocionProducto.model.js';
import Producto from '../models/producto.model.js';
import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroEnRango,
  analizarNumero,
} from '../utils/validacion.js';
import obtenerFechaArgentina from '../utils/fechaArgentina.js';

const MINIMO_DESCUENTO = 1;
const MAXIMO_DESCUENTO = 100;

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const validarId = (id) =>
  validarEnteroEnRango(
    id,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID de la promoción no es válido',
  );

// Validación de calendario real, no solo de formato: `new Date('2026-02-30')`
// NO da NaN, la normaliza silenciosamente al 2 de marzo (JS "hace rollover"
// de fechas inválidas en vez de rechazarlas). Antes, ese comportamiento
// pasaba la validación sin avisar. Ahora se arma la fecha a partir de sus
// componentes y se comprueba que year/month/day de la fecha resultante
// coincidan exactamente con lo que se pidió: si no coinciden, es que
// "rebotó" a otro día real (el caso de Feb 30) y se rechaza.
const validarFecha = (valor, nombreCampo) => {
  if (typeof valor !== 'string' || !PATRON_FECHA.test(valor)) {
    throw new AppError(`${nombreCampo} debe tener el formato AAAA-MM-DD`, 400);
  }

  const [anio, mes, dia] = valor.split('-').map(Number);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    throw new AppError(`${nombreCampo} no es una fecha de calendario válida`, 400);
  }

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  const esFechaReal =
    !Number.isNaN(fecha.getTime()) &&
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;

  if (!esFechaReal) {
    throw new AppError(`${nombreCampo} no es una fecha de calendario válida`, 400);
  }

  return valor;
};

const prepararDatos = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la promoción no es válido', 400);
  }

  const fechaInicio = validarFecha(datos.fechaInicio, 'La fecha de inicio');
  const fechaFin = validarFecha(datos.fechaFin, 'La fecha de fin');

  if (fechaFin < fechaInicio) {
    throw new AppError(
      'La fecha de fin no puede ser anterior a la fecha de inicio',
      400,
    );
  }

  const descuento = analizarNumero(datos.descuento);
  const textoDescuento =
    typeof datos.descuento === 'string'
      ? datos.descuento.trim()
      : String(datos.descuento);
  const decimales = /\.(\d+)$/.exec(textoDescuento)?.[1] || '';

  if (
    descuento === null ||
    descuento < MINIMO_DESCUENTO ||
    descuento > MAXIMO_DESCUENTO ||
    decimales.length > 2
  ) {
    throw new AppError(
      `El descuento debe ser un porcentaje entre ${MINIMO_DESCUENTO} y ${MAXIMO_DESCUENTO}`,
      400,
    );
  }

  const idProducto = validarEnteroEnRango(
    datos.idProducto,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID del producto no es válido',
  );

  return {
    fechaInicio,
    fechaFin,
    descuento: descuento.toFixed(2),
    idProducto,
  };
};

const comprobarProducto = async (idProducto, transaction) => {
  const producto = await Producto.findByPk(idProducto, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!producto) {
    throw new AppError('El producto indicado no existe', 400);
  }
};

const bloquearProductos = async (idsProducto, transaction) => {
  const idsUnicosOrdenados = [...new Set(idsProducto)].sort((a, b) => a - b);

  for (const idProducto of idsUnicosOrdenados) {
    await comprobarProducto(idProducto, transaction);
  }
};

const comprobarSinSuperposicion = async (
  { idProducto, fechaInicio, fechaFin },
  transaction,
  idExcluir = null,
) => {
  const where = {
    idProducto,
    fechaInicio: { [Op.lte]: fechaFin },
    fechaFin: { [Op.gte]: fechaInicio },
  };

  if (idExcluir !== null) {
    where.idPromocionProducto = { [Op.ne]: idExcluir };
  }

  const existente = await PromocionProducto.findOne({ where, transaction });

  if (existente) {
    throw new AppError(
      'El producto ya tiene una promoción que se superpone con ese período',
      409,
    );
  }
};

const relaciones = [{ model: Producto, as: 'producto' }];

const obtenerPromociones = async (fecha = obtenerFechaArgentina()) => {
  return PromocionProducto.findAll({
    include: relaciones,
    where: {
      fechaInicio: { [Op.lte]: fecha },
      fechaFin: { [Op.gte]: fecha },
    },
    order: [['fechaInicio', 'DESC']],
  });
};

const obtenerTodasLasPromociones = async () =>
  PromocionProducto.findAll({
    include: relaciones,
    order: [['fechaInicio', 'DESC']],
  });

const obtenerPromocionPublicaPorId = async (id) => {
  const idPromocionProducto = validarId(id);
  const fecha = obtenerFechaArgentina();
  const promocion = await PromocionProducto.findOne({
    where: {
      idPromocionProducto,
      fechaInicio: { [Op.lte]: fecha },
      fechaFin: { [Op.gte]: fecha },
    },
    include: relaciones,
  });

  if (!promocion) {
    throw new AppError('Promoción vigente no encontrada', 404);
  }

  return promocion;
};

const obtenerPromocionPorId = async (id) => {
  const idPromocionProducto = validarId(id);

  const promocion = await PromocionProducto.findByPk(idPromocionProducto, {
    include: relaciones,
  });

  if (!promocion) {
    throw new AppError('Promoción no encontrada', 404);
  }

  return promocion;
};

const crearPromocion = async (datos) => {
  const datosPreparados = prepararDatos(datos);

  const idPromocionProducto = await sequelize.transaction(async (transaction) => {
    await comprobarProducto(datosPreparados.idProducto, transaction);
    await comprobarSinSuperposicion(datosPreparados, transaction);
    const promocion = await PromocionProducto.create(datosPreparados, { transaction });
    return promocion.idPromocionProducto;
  });

  return obtenerPromocionPorId(idPromocionProducto);
};

const actualizarPromocion = async (id, datos) => {
  const idPromocionProducto = validarId(id);
  const datosPreparados = prepararDatos(datos);

  await sequelize.transaction(async (transaction) => {
    const promocionInicial = await PromocionProducto.findByPk(idPromocionProducto, {
      transaction,
    });

    if (!promocionInicial) {
      throw new AppError('Promoción no encontrada', 404);
    }

    await bloquearProductos(
      [promocionInicial.idProducto, datosPreparados.idProducto],
      transaction,
    );

    const promocion = await PromocionProducto.findByPk(idPromocionProducto, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (
      !promocion ||
      promocion.idProducto !== promocionInicial.idProducto
    ) {
      throw new AppError(
        'La promoción cambió mientras se editaba; volvé a intentarlo',
        409,
      );
    }

    await comprobarSinSuperposicion(datosPreparados, transaction, idPromocionProducto);
    await promocion.update(datosPreparados, { transaction });
  });

  return obtenerPromocionPorId(idPromocionProducto);
};

const eliminarPromocion = async (id) => {
  const idPromocionProducto = validarId(id);

  await sequelize.transaction(async (transaction) => {
    const promocionInicial = await PromocionProducto.findByPk(idPromocionProducto, {
      transaction,
    });

    if (!promocionInicial) {
      throw new AppError('Promoción no encontrada', 404);
    }

    await bloquearProductos([promocionInicial.idProducto], transaction);

    const promocion = await PromocionProducto.findByPk(idPromocionProducto, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!promocion || promocion.idProducto !== promocionInicial.idProducto) {
      throw new AppError(
        'La promoción cambió mientras se eliminaba; volvé a intentarlo',
        409,
      );
    }

    await promocion.destroy({ transaction });
  });
};

export {
  obtenerPromociones,
  obtenerTodasLasPromociones,
  obtenerPromocionPublicaPorId,
  obtenerPromocionPorId,
  crearPromocion,
  actualizarPromocion,
  eliminarPromocion,
  // Exportada para poder probar la validación de fecha/calendario en
  // aislamiento, sin necesitar que crearPromocion llegue hasta
  // comprobarRelaciones (que sí requiere la base).
  prepararDatos as prepararDatosPromocion,
};
