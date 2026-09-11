import PromocionProducto from '../models/promocionProducto.model.js';
import Producto from '../models/producto.model.js';
import Categoria from '../models/categoria.model.js';
import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroEnRango,
  prepararEnteroOpcional,
  analizarNumero,
} from '../utils/validacion.js';

// Máximo representable por una columna DECIMAL(5,2): no se asume que
// "descuento" sea necesariamente un porcentaje (0-100), esa semántica sigue
// sin confirmarse; solo se valida el rango que la columna admite.
const MAXIMO_DESCUENTO = 999.99;

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

  if (descuento === null || descuento < 0 || descuento > MAXIMO_DESCUENTO) {
    throw new AppError(
      `El descuento debe ser un número entre 0 y ${MAXIMO_DESCUENTO}`,
      400,
    );
  }

  const idProducto = validarEnteroEnRango(
    datos.idProducto,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID del producto no es válido',
  );

  const idCategoria = prepararEnteroOpcional(
    datos.idCategoria,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID de la categoría no es válido',
  );

  return {
    fechaInicio,
    fechaFin,
    descuento: descuento.toFixed(2),
    idProducto,
    idCategoria,
  };
};

const comprobarRelaciones = async ({ idProducto, idCategoria }) => {
  const producto = await Producto.findByPk(idProducto);

  if (!producto) {
    throw new AppError('El producto indicado no existe', 400);
  }

  if (idCategoria) {
    const categoria = await Categoria.findByPk(idCategoria);

    if (!categoria) {
      throw new AppError('La categoría indicada no existe', 400);
    }
  }
};

const relaciones = [
  { model: Producto, as: 'producto' },
  { model: Categoria, as: 'categoria' },
];

const obtenerPromociones = async () => {
  return PromocionProducto.findAll({
    include: relaciones,
    order: [['fechaInicio', 'DESC']],
  });
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

  await comprobarRelaciones(datosPreparados);

  const promocion = await PromocionProducto.create(datosPreparados);

  return obtenerPromocionPorId(promocion.idPromocionProducto);
};

const actualizarPromocion = async (id, datos) => {
  const idPromocionProducto = validarId(id);
  const datosPreparados = prepararDatos(datos);

  const promocion = await PromocionProducto.findByPk(idPromocionProducto);

  if (!promocion) {
    throw new AppError('Promoción no encontrada', 404);
  }

  await comprobarRelaciones(datosPreparados);
  await promocion.update(datosPreparados);

  return obtenerPromocionPorId(idPromocionProducto);
};

const eliminarPromocion = async (id) => {
  const promocion = await obtenerPromocionPorId(id);

  await promocion.destroy();
};

export {
  obtenerPromociones,
  obtenerPromocionPorId,
  crearPromocion,
  actualizarPromocion,
  eliminarPromocion,
  // Exportada para poder probar la validación de fecha/calendario en
  // aislamiento, sin necesitar que crearPromocion llegue hasta
  // comprobarRelaciones (que sí requiere la base).
  prepararDatos as prepararDatosPromocion,
};
