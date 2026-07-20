import {
  obtenerCategorias,
  obtenerCategoriaPorId,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
} from '../services/categoria.service.js';

const listar = async (req, res, next) => {
  try {
    const categorias = await obtenerCategorias();
    res.status(200).json(categorias);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const categoria = await obtenerCategoriaPorId(req.params.id);
    res.status(200).json(categoria);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const categoria = await crearCategoria(req.body);
    res.status(201).json(categoria);
  } catch (error) {
    next(error);
  }
};

const actualizar = async (req, res, next) => {
  try {
    const categoria = await actualizarCategoria(
      req.params.id,
      req.body,
    );

    res.status(200).json(categoria);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarCategoria(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
};