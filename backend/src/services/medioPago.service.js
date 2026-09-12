import MedioPago from '../models/medioPago.model.js';
import AppError from '../errors/AppError.js';
import {
  MAXIMO_ENTERO_POSITIVO,
  esObjetoPlano,
  validarEnteroEnRango,
  limpiarCadenaOpcional,
} from '../utils/validacion.js';

const validarId = (id) =>
  validarEnteroEnRango(
    id,
    1,
    MAXIMO_ENTERO_POSITIVO,
    'El ID del medio de pago no es válido',
  );

const prepararHabilitado = (valor) => {
  if (valor === undefined) {
    return true;
  }

  if (valor === true || valor === 1 || valor === '1') {
    return true;
  }

  if (valor === false || valor === 0 || valor === '0') {
    return false;
  }

  throw new AppError(
    'El campo habilitado debe ser verdadero o falso',
    400,
  );
};

const prepararDatos = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo del medio de pago no es válido', 400);
  }

  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion = limpiarCadenaOpcional(
    datos.descripcion,
    'La descripción',
  );

  const habilitado = prepararHabilitado(datos.habilitado);

  if (nombre.length < 2 || nombre.length > 50) {
    throw new AppError(
      'El nombre debe contener entre 2 y 50 caracteres',
      400,
    );
  }

  if (descripcion && descripcion.length > 150) {
    throw new AppError(
      'La descripción no puede superar los 150 caracteres',
      400,
    );
  }

  return {
    nombre,
    descripcion: descripcion || null,
    habilitado,
  };
};

const obtenerMediosPago = async () => {
  return MedioPago.findAll({
    order: [['nombre', 'ASC']],
  });
};

const obtenerMedioPagoPorId = async (id) => {
  const idMedioPago = validarId(id);
  const medioPago = await MedioPago.findByPk(idMedioPago);

  if (!medioPago) {
    throw new AppError('Medio de pago no encontrado', 404);
  }

  return medioPago;
};

const crearMedioPago = async (datos) => {
  const datosPreparados = prepararDatos(datos);
  return MedioPago.create(datosPreparados);
};

const actualizarMedioPago = async (id, datos) => {
  const datosPreparados = prepararDatos(datos);
  const medioPago = await obtenerMedioPagoPorId(id);

  await medioPago.update(datosPreparados);

  return medioPago;
};

const eliminarMedioPago = async (id) => {
  const medioPago = await obtenerMedioPagoPorId(id);

  await medioPago.destroy();
};

export {
  obtenerMediosPago,
  obtenerMedioPagoPorId,
  crearMedioPago,
  actualizarMedioPago,
  eliminarMedioPago,
};