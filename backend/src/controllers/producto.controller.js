import {
  obtenerProductos,
  obtenerSugerenciasBusqueda,
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

const sugerencias = async (req, res, next) => {
  try {
    const productos = await obtenerSugerenciasBusqueda(req.query);
    res.status(200).json(productos);
  } catch (error) {
    next(error);
  }
};

const listarStockBajo = async (req, res, next) => {
  try {
    const productos = await obtenerProductosConStockBajo(req.usuario);
    res.status(200).json(productos);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    // Ruta pública (ver producto.routes.js): un producto de una tienda
    // suspendida no debe verse ni por link directo — ver
    // producto.service.js#obtenerProductoPorId.
    const producto = await obtenerProductoPorId(req.params.id, { ocultarSiTiendaSuspendida: true });
    res.status(200).json(producto);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const producto = await crearProducto(req.body, req.usuario);
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
      req.usuario,
    );

    res.status(200).json(producto);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarProducto(req.params.id, req.usuario);
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
      req.usuario,
    );

    res.status(200).json(producto);
  } catch (error) {
    next(error);
  }
};

export {
  listar,
  sugerencias,
  listarStockBajo,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
  ajustarStock,
};
