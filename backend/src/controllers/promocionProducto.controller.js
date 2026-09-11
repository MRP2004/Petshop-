import {
  obtenerPromociones,
  obtenerPromocionPorId,
  crearPromocion,
  actualizarPromocion,
  eliminarPromocion,
} from '../services/promocionProducto.service.js';

const listar = async (req, res, next) => {
  try {
    const promociones = await obtenerPromociones();
    res.status(200).json(promociones);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const promocion = await obtenerPromocionPorId(req.params.id);
    res.status(200).json(promocion);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const promocion = await crearPromocion(req.body);
    res.status(201).json(promocion);
  } catch (error) {
    next(error);
  }
};

const actualizar = async (req, res, next) => {
  try {
    const promocion = await actualizarPromocion(req.params.id, req.body);
    res.status(200).json(promocion);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarPromocion(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export { listar, buscarPorId, crear, actualizar, eliminar };
