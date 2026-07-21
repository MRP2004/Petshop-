import {
  obtenerTiposMascota,
  obtenerTipoMascotaPorId,
  crearTipoMascota,
  actualizarTipoMascota,
  eliminarTipoMascota,
} from '../services/tipoMascota.service.js';

export const listar = async (req, res, next) => {
  try {
    const tiposMascota = await obtenerTiposMascota();
    res.status(200).json(tiposMascota);
  } catch (error) {
    next(error);
  }
};

export const obtenerPorId = async (req, res, next) => {
  try {
    const tipoMascota = await obtenerTipoMascotaPorId(req.params.id);
    res.status(200).json(tipoMascota);
  } catch (error) {
    next(error);
  }
};

export const crear = async (req, res, next) => {
  try {
    const tipoMascota = await crearTipoMascota(req.body);
    res.status(201).json(tipoMascota);
  } catch (error) {
    next(error);
  }
};

export const actualizar = async (req, res, next) => {
  try {
    const tipoMascota = await actualizarTipoMascota(
      req.params.id,
      req.body,
    );

    res.status(200).json(tipoMascota);
  } catch (error) {
    next(error);
  }
};

export const eliminar = async (req, res, next) => {
  try {
    await eliminarTipoMascota(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};