import { solicitarSerVendedor, listarSolicitudesVendedor, resolverSolicitudVendedor } from '../services/tienda.service.js';

const crear = async (req, res, next) => {
  try {
    await solicitarSerVendedor(req.body, req.usuario);
    res.status(201).send();
  } catch (error) {
    next(error);
  }
};

const listar = async (req, res, next) => {
  try {
    const solicitudes = await listarSolicitudesVendedor(req.usuario);
    res.status(200).json(solicitudes);
  } catch (error) {
    next(error);
  }
};

const aprobar = async (req, res, next) => {
  try {
    await resolverSolicitudVendedor(req.params.id, 'aprobar', req.usuario);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const rechazar = async (req, res, next) => {
  try {
    await resolverSolicitudVendedor(req.params.id, 'rechazar', req.usuario, req.body?.motivoRechazo);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export { crear, listar, aprobar, rechazar };
