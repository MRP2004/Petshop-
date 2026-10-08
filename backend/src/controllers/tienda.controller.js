import {
  obtenerTiendaPropia,
  listarTiendas,
  cambiarEstadoTienda,
  listarVentasDeTienda,
  obtenerVentaDeTiendaPorId,
  listarProductosDeTienda,
} from '../services/tienda.service.js';

const obtenerPropia = async (req, res, next) => {
  try {
    const tienda = await obtenerTiendaPropia(req.usuario);
    res.status(200).json(tienda);
  } catch (error) {
    next(error);
  }
};

const listar = async (req, res, next) => {
  try {
    const tiendas = await listarTiendas(req.usuario);
    res.status(200).json(tiendas);
  } catch (error) {
    next(error);
  }
};

const cambiarEstado = async (req, res, next) => {
  try {
    const tienda = await cambiarEstadoTienda(req.params.id, req.body?.estado, req.usuario);
    res.status(200).json(tienda);
  } catch (error) {
    next(error);
  }
};

const misProductos = async (req, res, next) => {
  try {
    const productos = await listarProductosDeTienda(req.usuario);
    res.status(200).json(productos);
  } catch (error) {
    next(error);
  }
};

const misVentas = async (req, res, next) => {
  try {
    const ventas = await listarVentasDeTienda(req.usuario);
    res.status(200).json(ventas);
  } catch (error) {
    next(error);
  }
};

const miVentaPorId = async (req, res, next) => {
  try {
    const venta = await obtenerVentaDeTiendaPorId(req.params.id, req.usuario);
    res.status(200).json(venta);
  } catch (error) {
    next(error);
  }
};

export { obtenerPropia, listar, cambiarEstado, misProductos, misVentas, miVentaPorId };
