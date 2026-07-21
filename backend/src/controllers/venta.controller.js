import {
  obtenerVentas,
  obtenerVentaPorId,
  registrarVenta,
  cancelarVenta,
  marcarVentaComoEnviada,
} from '../services/venta.service.js';

const listar = async (req, res, next) => {
  try {
    const ventas = await obtenerVentas();
    res.status(200).json(ventas);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const venta = await obtenerVentaPorId(req.params.id);
    res.status(200).json(venta);
  } catch (error) {
    next(error);
  }
};

const registrar = async (req, res, next) => {
  try {
    const venta = await registrarVenta(req.body);
    res.status(201).json(venta);
  } catch (error) {
    next(error);
  }
};

const cancelar = async (req, res, next) => {
  try {
    const venta = await cancelarVenta(req.params.id);
    res.status(200).json(venta);
  } catch (error) {
    next(error);
  }
};

const marcarComoEnviada = async (req, res, next) => {
  try {
    const venta = await marcarVentaComoEnviada(req.params.id);
    res.status(200).json(venta);
  } catch (error) {
    next(error);
  }
};

export {
  listar,
  buscarPorId,
  registrar,
  cancelar,
  marcarComoEnviada,
};