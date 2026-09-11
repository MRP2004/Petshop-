import Cliente from '../models/cliente.model.js';
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
    'El ID del cliente no es válido',
  );

// Exportada (como prepararDatosCliente) para que el registro público de
// usuarios (usuario.service.js) valide los datos de Cliente con las mismas
// reglas que el CRUD administrativo, en vez de duplicarlas.
const prepararDatos = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo del cliente no es válido', 400);
  }

  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const apellido =
    typeof datos.apellido === 'string'
      ? datos.apellido.trim()
      : '';

  const telefono = limpiarCadenaOpcional(datos.telefono, 'El teléfono');
  const email = limpiarCadenaOpcional(datos.email, 'El correo electrónico');
  const direccion = limpiarCadenaOpcional(datos.direccion, 'La dirección');

  if (nombre.length < 2 || nombre.length > 50) {
    throw new AppError(
      'El nombre debe contener entre 2 y 50 caracteres',
      400,
    );
  }

  if (apellido.length < 2 || apellido.length > 50) {
    throw new AppError(
      'El apellido debe contener entre 2 y 50 caracteres',
      400,
    );
  }

  if (telefono && telefono.length > 30) {
    throw new AppError(
      'El teléfono no puede superar los 30 caracteres',
      400,
    );
  }

  if (email && email.length > 100) {
    throw new AppError(
      'El correo electrónico no puede superar los 100 caracteres',
      400,
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(
      'El correo electrónico no es válido',
      400,
    );
  }

  if (direccion && direccion.length > 150) {
    throw new AppError(
      'La dirección no puede superar los 150 caracteres',
      400,
    );
  }

  return {
    nombre,
    apellido,
    telefono,
    email,
    direccion,
  };
};

const obtenerClientes = async () => {
  return Cliente.findAll({
    order: [
      ['apellido', 'ASC'],
      ['nombre', 'ASC'],
    ],
  });
};

const obtenerClientePorId = async (id) => {
  const idCliente = validarId(id);
  const cliente = await Cliente.findByPk(idCliente);

  if (!cliente) {
    throw new AppError('Cliente no encontrado', 404);
  }

  return cliente;
};

const crearCliente = async (datos) => {
  const datosPreparados = prepararDatos(datos);
  return Cliente.create(datosPreparados);
};

const actualizarCliente = async (id, datos) => {
  const datosPreparados = prepararDatos(datos);
  const cliente = await obtenerClientePorId(id);

  await cliente.update(datosPreparados);

  return cliente;
};

const eliminarCliente = async (id) => {
  const cliente = await obtenerClientePorId(id);

  await cliente.destroy();
};

export {
  obtenerClientes,
  obtenerClientePorId,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
  prepararDatos as prepararDatosCliente,
};