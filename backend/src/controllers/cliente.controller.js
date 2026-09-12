import {
  obtenerClientes,
  obtenerClientePorId,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from '../services/cliente.service.js';

const listar = async (req, res, next) => {
  try {
    const clientes = await obtenerClientes();
    res.status(200).json(clientes);
  } catch (error) {
    next(error);
  }
};

const buscarPorId = async (req, res, next) => {
  try {
    const cliente = await obtenerClientePorId(req.params.id);
    res.status(200).json(cliente);
  } catch (error) {
    next(error);
  }
};

const crear = async (req, res, next) => {
  try {
    const cliente = await crearCliente(req.body);
    res.status(201).json(cliente);
  } catch (error) {
    next(error);
  }
};

const actualizar = async (req, res, next) => {
  try {
    const cliente = await actualizarCliente(
      req.params.id,
      req.body,
    );

    res.status(200).json(cliente);
  } catch (error) {
    next(error);
  }
};

const eliminar = async (req, res, next) => {
  try {
    await eliminarCliente(req.params.id);
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