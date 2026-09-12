import {
  obtenerProveedores,
  obtenerProveedorPorId,
  crearProveedor,
  actualizarProveedor,
  eliminarProveedor,
} from '../services/proveedor.service.js';

const listar = async (req, res, next) => {
  try {
    const proveedores = await obtenerProveedores();
    res.status(200).json(proveedores);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const proveedor = await obtenerProveedorPorId(req.params.id);
    res.status(200).json(proveedor);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const proveedor = await crearProveedor(req.body);
    res.status(201).json(proveedor);
  } catch (error) {
    next(error);
  }
};

const actualizar = async (req, res, next) => {
  try {
    const proveedor = await actualizarProveedor(
      req.params.id,
      req.body,
    );

    res.status(200).json(proveedor);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarProveedor(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
};