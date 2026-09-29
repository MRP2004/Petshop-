import { listarFavoritosPropios, agregarFavorito, quitarFavorito } from '../services/favorito.service.js';
import AppError from '../errors/AppError.js';
import { esObjetoPlano } from '../utils/validacion.js';

const listar = async (req, res, next) => {
  try {
    const favoritos = await listarFavoritosPropios(req.usuario.idCliente);
    res.status(200).json(favoritos);
  } catch (error) {
    next(error);
  }
};

const agregar = async (req, res, next) => {
  try {
    if (!esObjetoPlano(req.body)) {
      throw new AppError('El cuerpo de la solicitud no es válido', 400);
    }
    await agregarFavorito(req.usuario.idCliente, req.body.idProducto);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const quitar = async (req, res, next) => {
  try {
    await quitarFavorito(req.usuario.idCliente, req.params.idProducto);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export { listar, agregar, quitar };
