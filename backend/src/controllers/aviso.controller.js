import { listarAvisosPropios, marcarComoLeido, marcarTodosComoLeidos } from '../services/aviso.service.js';

const listar = async (req, res, next) => {
  try {
    const avisos = await listarAvisosPropios(req.usuario.idUsuario);
    res.status(200).json(avisos);
  } catch (error) {
    next(error);
  }
};

const marcarUnoLeido = async (req, res, next) => {
  try {
    await marcarComoLeido(req.usuario.idUsuario, req.params.idAviso);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const marcarTodosLeidos = async (req, res, next) => {
  try {
    await marcarTodosComoLeidos(req.usuario.idUsuario);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export { listar, marcarUnoLeido, marcarTodosLeidos };
