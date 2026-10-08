import AppError from '../errors/AppError.js';
import { obtenerProvincias, obtenerLocalidades } from '../services/georef.service.js';

const provincias = (req, res) => {
  res.status(200).json(obtenerProvincias());
};

const localidades = async (req, res, next) => {
  try {
    const idProvincia = typeof req.query.idProvincia === 'string' ? req.query.idProvincia.trim() : '';

    if (!idProvincia) {
      throw new AppError('El parámetro idProvincia es obligatorio', 400);
    }

    const resultado = await obtenerLocalidades(idProvincia);
    res.status(200).json(resultado);
  } catch (error) {
    next(error);
  }
};

export { provincias, localidades };
