import { obtenerDireccionPropia, guardarDireccionPropia } from '../services/direccionCliente.service.js';

const obtener = async (req, res, next) => {
  try {
    const direccion = await obtenerDireccionPropia(req.usuario.idCliente);
    res.status(200).json(direccion); // null si todavía no guardó ninguna
  } catch (error) {
    next(error);
  }
};

const guardar = async (req, res, next) => {
  try {
    const direccion = await guardarDireccionPropia(req.usuario.idCliente, req.body);
    res.status(200).json(direccion);
  } catch (error) {
    next(error);
  }
};

export { obtener, guardar };
