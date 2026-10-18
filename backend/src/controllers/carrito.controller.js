import {
  obtenerCarritoPropio,
  agregarAlCarritoPropio,
  actualizarCantidadCarritoPropio,
  quitarDelCarritoPropio,
  vaciarCarritoPropio,
  importarSiEstaVacio,
} from '../services/carrito.service.js';
import AppError from '../errors/AppError.js';
import { esObjetoPlano } from '../utils/validacion.js';

const listar = async (req, res, next) => {
  try {
    const items = await obtenerCarritoPropio(req.usuario.idUsuario);
    res.status(200).json({ items });
  } catch (error) {
    next(error);
  }
};

const agregar = async (req, res, next) => {
  try {
    if (!esObjetoPlano(req.body)) {
      throw new AppError('El cuerpo de la solicitud no es válido', 400);
    }

    const items = await agregarAlCarritoPropio(
      req.usuario.idUsuario,
      req.body.idProducto,
      req.body.cantidad,
    );
    res.status(200).json({ items });
  } catch (error) {
    next(error);
  }
};

const actualizarCantidad = async (req, res, next) => {
  try {
    if (!esObjetoPlano(req.body)) {
      throw new AppError('El cuerpo de la solicitud no es válido', 400);
    }

    const items = await actualizarCantidadCarritoPropio(
      req.usuario.idUsuario,
      req.params.idProducto,
      req.body.cantidad,
    );
    res.status(200).json({ items });
  } catch (error) {
    next(error);
  }
};

const quitar = async (req, res, next) => {
  try {
    const items = await quitarDelCarritoPropio(req.usuario.idUsuario, req.params.idProducto);
    res.status(200).json({ items });
  } catch (error) {
    next(error);
  }
};

const vaciar = async (req, res, next) => {
  try {
    await vaciarCarritoPropio(req.usuario.idUsuario);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const importar = async (req, res, next) => {
  try {
    if (!esObjetoPlano(req.body) || !Array.isArray(req.body.items)) {
      throw new AppError('Los productos del carrito no son válidos', 400);
    }

    const resultado = await importarSiEstaVacio(req.usuario.idUsuario, req.body.items);
    res.status(200).json(resultado);
  } catch (error) {
    next(error);
  }
};

export { listar, agregar, actualizarCantidad, quitar, vaciar, importar };
