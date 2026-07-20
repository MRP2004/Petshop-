import TipoMascota from '../models/tipoMascota.model.js';
import AppError from '../errors/AppError.js';

const validarId = (id) => {
  const idNumerico = Number(id);

  if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
    throw new AppError('El ID debe ser un número entero positivo', 400);
  }

  return idNumerico;
};

const validarDatos = (datos) => {
  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion =
    typeof datos.descripcion === 'string'
      ? datos.descripcion.trim()
      : null;

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
  };
};

export const obtenerTiposMascota = async () => {
  return TipoMascota.findAll({
    order: [['nombre', 'ASC']],
  });
};

export const obtenerTipoMascotaPorId = async (id) => {
  const idNumerico = validarId(id);
  const tipoMascota = await TipoMascota.findByPk(idNumerico);

  if (!tipoMascota) {
    throw new AppError('Tipo de mascota no encontrado', 404);
  }

  return tipoMascota;
};

export const crearTipoMascota = async (datos) => {
  const datosValidados = validarDatos(datos);

  return TipoMascota.create(datosValidados);
};

export const actualizarTipoMascota = async (id, datos) => {
  const tipoMascota = await obtenerTipoMascotaPorId(id);
  const datosValidados = validarDatos(datos);

  return tipoMascota.update(datosValidados);
};

export const eliminarTipoMascota = async (id) => {
  const tipoMascota = await obtenerTipoMascotaPorId(id);

  await tipoMascota.destroy();
};