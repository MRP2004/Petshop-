import Proveedor from '../models/proveedor.model.js';
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
    'El ID del proveedor no es válido',
  );

const prepararDatos = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo del proveedor no es válido', 400);
  }

  const descripcion =
    typeof datos.descripcion === 'string'
      ? datos.descripcion.trim()
      : '';

  const direccion = limpiarCadenaOpcional(datos.direccion, 'La dirección');
  const CUIT = limpiarCadenaOpcional(datos.CUIT, 'El CUIT');
  const telefono = limpiarCadenaOpcional(datos.telefono, 'El teléfono');
  const mail = limpiarCadenaOpcional(datos.mail, 'El correo electrónico');

  if (descripcion.length < 2 || descripcion.length > 100) {
    throw new AppError(
      'La descripción debe contener entre 2 y 100 caracteres',
      400,
    );
  }

  if (direccion && direccion.length > 150) {
    throw new AppError(
      'La dirección no puede superar los 150 caracteres',
      400,
    );
  }

  if (CUIT && CUIT.length > 20) {
    throw new AppError(
      'El CUIT no puede superar los 20 caracteres',
      400,
    );
  }

  if (telefono && telefono.length > 30) {
    throw new AppError(
      'El teléfono no puede superar los 30 caracteres',
      400,
    );
  }

  if (mail && mail.length > 100) {
    throw new AppError(
      'El correo electrónico no puede superar los 100 caracteres',
      400,
    );
  }

  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new AppError(
      'El correo electrónico no es válido',
      400,
    );
  }

  return {
    descripcion,
    direccion,
    CUIT,
    telefono,
    mail,
  };
};

const obtenerProveedores = async () => {
  return Proveedor.findAll({
    order: [['descripcion', 'ASC']],
  });
};

const obtenerProveedorPorId = async (id) => {
  const idProveedor = validarId(id);
  const proveedor = await Proveedor.findByPk(idProveedor);

  if (!proveedor) {
    throw new AppError('Proveedor no encontrado', 404);
  }

  return proveedor;
};

const crearProveedor = async (datos) => {
  const datosPreparados = prepararDatos(datos);
  return Proveedor.create(datosPreparados);
};

const actualizarProveedor = async (id, datos) => {
  const datosPreparados = prepararDatos(datos);
  const proveedor = await obtenerProveedorPorId(id);

  await proveedor.update(datosPreparados);

  return proveedor;
};

const eliminarProveedor = async (id) => {
  const proveedor = await obtenerProveedorPorId(id);

  await proveedor.destroy();
};

export {
  obtenerProveedores,
  obtenerProveedorPorId,
  crearProveedor,
  actualizarProveedor,
  eliminarProveedor,
};