import MedioPago from '../models/medioPago.model.js';
import AppError from '../errors/AppError.js';

const validarId = (id) => {
  const idMedioPago = Number(id);

  if (!Number.isInteger(idMedioPago) || idMedioPago <= 0) {
    throw new AppError(
      'El ID del medio de pago no es válido',
      400,
    );
  }

  return idMedioPago;
};

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
  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion =
    typeof datos.descripcion === 'string'
      ? datos.descripcion.trim()
      : null;

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
  const medioPago = await obtenerMedioPagoPorId(id);
  const datosPreparados = prepararDatos(datos);

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