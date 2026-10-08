import { solicitarCancelacion, resolverSolicitudCancelacion } from '../services/solicitudCancelacion.service.js';

const crear = async (req, res, next) => {
  try {
    const venta = await solicitarCancelacion(req.body?.idVenta, req.usuario);
    res.status(201).json(venta);
  } catch (error) {
    next(error);
  }
};

const aprobar = async (req, res, next) => {
  try {
    const venta = await resolverSolicitudCancelacion(req.params.id, 'aprobar', req.usuario);
    res.status(200).json(venta);
  } catch (error) {
    next(error);
  }
};

const rechazar = async (req, res, next) => {
  try {
    const venta = await resolverSolicitudCancelacion(
      req.params.id,
      'rechazar',
      req.usuario,
      req.body?.motivoRechazo,
    );
    res.status(200).json(venta);
  } catch (error) {
    next(error);
  }
};

export { crear, aprobar, rechazar };
