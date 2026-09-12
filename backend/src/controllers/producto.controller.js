import {
  obtenerProductos,
  obtenerProductosConStockBajo,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  ajustarStockProducto,
} from '../services/producto.service.js';

const listar = async (req, res, next) => {
  try {
    const productos = await obtenerProductos(req.query);
    res.status(200).json(productos);
  } catch (error) {
    next(error);
  }
};

const listarStockBajo = async (req, res, next) => {
  try {
    const productos = await obtenerProductosConStockBajo();
    res.status(200).json(productos);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const producto = await obtenerProductoPorId(req.params.id);
    res.status(200).json(producto);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const producto = await crearProducto(req.body);
    res.status(201).json(producto);
  } catch (error) {
    next(error);
  }
};

const actualizar = async (req, res, next) => {
  try {
    const producto = await actualizarProducto(
      req.params.id,
      req.body,
    );

    res.status(200).json(producto);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarProducto(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const ajustarStock = async (req, res, next) => {
  try {
    const producto = await ajustarStockProducto(
      req.params.id,
      req.body,
    );

    res.status(200).json(producto);
  } catch (error) {
    next(error);
  }
};

export {
  listar,
  listarStockBajo,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
  ajustarStock,
};