import Categoria from '../models/categoria.model.js';
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
    'El ID de la categoría no es válido',
  );

const prepararDatos = (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la categoría no es válido', 400);
  }

  const nombre =
    typeof datos.nombre === 'string' ? datos.nombre.trim() : '';

  const descripcion = limpiarCadenaOpcional(
    datos.descripcion,
    'La descripción',
  );

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

const obtenerCategorias = async () => {
  return Categoria.findAll({
    order: [['nombre', 'ASC']],
  });
};

const obtenerCategoriaPorId = async (id) => {
  const idCategoria = validarId(id);
  const categoria = await Categoria.findByPk(idCategoria);

  if (!categoria) {
    throw new AppError('Categoría no encontrada', 404);
  }

  return categoria;
};

const crearCategoria = async (datos) => {
  const datosPreparados = prepararDatos(datos);
  return Categoria.create(datosPreparados);
};

const actualizarCategoria = async (id, datos) => {
  const datosPreparados = prepararDatos(datos);
  const categoria = await obtenerCategoriaPorId(id);

  await categoria.update(datosPreparados);

  return categoria;
};

const eliminarCategoria = async (id) => {
  const categoria = await obtenerCategoriaPorId(id);

  await categoria.destroy();
};

export {
  obtenerCategorias,
  obtenerCategoriaPorId,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
};