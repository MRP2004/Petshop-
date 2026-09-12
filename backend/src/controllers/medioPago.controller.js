import {
  obtenerMediosPago,
  obtenerMedioPagoPorId,
  crearMedioPago,
  actualizarMedioPago,
  eliminarMedioPago,
} from '../services/medioPago.service.js';

const listar = async (req, res, next) => {
  try {
    const mediosPago = await obtenerMediosPago();
    res.status(200).json(mediosPago);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const medioPago = await obtenerMedioPagoPorId(req.params.id);
    res.status(200).json(medioPago);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const medioPago = await crearMedioPago(req.body);
    res.status(201).json(medioPago);
  } catch (error) {
    next(error);
  }
};

const actualizar = async (req, res, next) => {
  try {
    const medioPago = await actualizarMedioPago(
      req.params.id,
      req.body,
    );

    res.status(200).json(medioPago);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarMedioPago(req.params.id);
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