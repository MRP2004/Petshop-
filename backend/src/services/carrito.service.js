import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import ItemCarrito from '../models/itemCarrito.model.js';
import Producto from '../models/producto.model.js';
import Usuario from '../models/usuario.model.js';
import AppError from '../errors/AppError.js';
import { MAXIMO_ENTERO_POSITIVO, validarEnteroEnRango, esObjetoPlano } from '../utils/validacion.js';

const validarIdUsuario = (idUsuario) =>
  validarEnteroEnRango(idUsuario, 1, MAXIMO_ENTERO_POSITIVO, 'El usuario no es válido');

const validarIdProducto = (idProducto) =>
  validarEnteroEnRango(idProducto, 1, MAXIMO_ENTERO_POSITIVO, 'El ID del producto no es válido');

const validarCantidad = (cantidad) =>
  validarEnteroEnRango(cantidad, 1, MAXIMO_ENTERO_POSITIVO, 'La cantidad debe ser un entero positivo');

const prepararItems = (items) => {
  if (!Array.isArray(items)) {
    throw new AppError('Los productos del carrito no son válidos', 400);
  }

  const idsProductos = new Set();
  return items.map((item) => {
    if (!esObjetoPlano(item)) {
      throw new AppError('Un producto del carrito no es válido', 400);
    }

    const idProducto = validarIdProducto(item.idProducto);
    const cantidad = validarCantidad(item.cantidad);

    if (idsProductos.has(idProducto)) {
      throw new AppError('El carrito contiene productos duplicados', 400);
    }

    idsProductos.add(idProducto);
    return { idProducto, cantidad };
  });
};

const buscarUsuarioBloqueado = async (idUsuario, transaction) => {
  const usuario = await Usuario.findByPk(idUsuario, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!usuario) {
    throw new AppError('La cuenta no existe', 404);
  }
};

const obtenerFilasCarrito = (idUsuario, transaction) =>
  ItemCarrito.findAll({
    where: { idUsuario },
    include: [{ model: Producto, as: 'producto', required: true }],
    order: [['creadoEn', 'ASC'], ['idItemCarrito', 'ASC']],
    transaction,
  });

const presentarItems = (filas) =>
  filas.map((fila) => ({
    producto: fila.producto,
    cantidad: fila.cantidad,
  }));

const verificarProductos = async (items, transaction) => {
  if (items.length === 0) return;

  const productos = await Producto.findAll({
    where: { idProducto: { [Op.in]: items.map((item) => item.idProducto) } },
    attributes: ['idProducto'],
    transaction,
  });

  if (productos.length !== items.length) {
    throw new AppError('Uno o más productos del carrito no existen', 400);
  }
};

const obtenerCarritoPropio = async (idUsuarioCrudo) => {
  const idUsuario = validarIdUsuario(idUsuarioCrudo);
  const filas = await obtenerFilasCarrito(idUsuario);
  return presentarItems(filas);
};

const agregarAlCarritoPropio = async (idUsuarioCrudo, idProductoCrudo, cantidadCruda = 1) => {
  const idUsuario = validarIdUsuario(idUsuarioCrudo);
  const idProducto = validarIdProducto(idProductoCrudo);
  const cantidad = validarCantidad(cantidadCruda);

  return sequelize.transaction(async (transaction) => {
    await buscarUsuarioBloqueado(idUsuario, transaction);
    await verificarProductos([{ idProducto }], transaction);

    const existente = await ItemCarrito.findOne({
      where: { idUsuario, idProducto },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existente) {
      const nuevaCantidad = existente.cantidad + cantidad;
      if (!Number.isSafeInteger(nuevaCantidad) || nuevaCantidad > MAXIMO_ENTERO_POSITIVO) {
        throw new AppError('La cantidad supera el máximo permitido', 400);
      }
      await existente.update({ cantidad: nuevaCantidad }, { transaction });
    } else {
      await ItemCarrito.create({ idUsuario, idProducto, cantidad }, { transaction });
    }

    return presentarItems(await obtenerFilasCarrito(idUsuario, transaction));
  });
};

const actualizarCantidadCarritoPropio = async (idUsuarioCrudo, idProductoCrudo, cantidadCruda) => {
  const idUsuario = validarIdUsuario(idUsuarioCrudo);
  const idProducto = validarIdProducto(idProductoCrudo);
  const cantidad = validarCantidad(cantidadCruda);

  return sequelize.transaction(async (transaction) => {
    await buscarUsuarioBloqueado(idUsuario, transaction);

    const item = await ItemCarrito.findOne({
      where: { idUsuario, idProducto },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!item) {
      throw new AppError('El producto no está en el carrito', 404);
    }

    await item.update({ cantidad }, { transaction });
    return presentarItems(await obtenerFilasCarrito(idUsuario, transaction));
  });
};

const quitarDelCarritoPropio = async (idUsuarioCrudo, idProductoCrudo) => {
  const idUsuario = validarIdUsuario(idUsuarioCrudo);
  const idProducto = validarIdProducto(idProductoCrudo);

  return sequelize.transaction(async (transaction) => {
    await buscarUsuarioBloqueado(idUsuario, transaction);
    await ItemCarrito.destroy({ where: { idUsuario, idProducto }, transaction });
    return presentarItems(await obtenerFilasCarrito(idUsuario, transaction));
  });
};

const vaciarCarritoPropio = async (idUsuarioCrudo) => {
  const idUsuario = validarIdUsuario(idUsuarioCrudo);

  return sequelize.transaction(async (transaction) => {
    await vaciarCarritoEnTransaccion(idUsuario, transaction);
  });
};

const vaciarCarritoEnTransaccion = async (idUsuarioCrudo, transaction) => {
  if (!transaction || transaction.finished) {
    throw new Error('Se requiere una transacción activa para vaciar el carrito');
  }

  const idUsuario = validarIdUsuario(idUsuarioCrudo);
  await buscarUsuarioBloqueado(idUsuario, transaction);
  return ItemCarrito.destroy({ where: { idUsuario }, transaction });
};

// Importa el carrito anónimo solo si la cuenta todavía no tiene productos.
// El bloqueo de la fila del usuario serializa esta decisión con las demás
// operaciones del carrito, de modo que una importación no sobrescriba un
// carrito que se haya empezado a modificar al mismo tiempo.
const importarSiEstaVacio = async (idUsuarioCrudo, itemsCrudos) => {
  const idUsuario = validarIdUsuario(idUsuarioCrudo);
  const items = prepararItems(itemsCrudos);

  return sequelize.transaction(async (transaction) => {
    await buscarUsuarioBloqueado(idUsuario, transaction);
    const actuales = await ItemCarrito.findAll({
      where: { idUsuario },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (actuales.length > 0) {
      return {
        importado: false,
        items: presentarItems(await obtenerFilasCarrito(idUsuario, transaction)),
      };
    }

    await verificarProductos(items, transaction);
    if (items.length > 0) {
      await ItemCarrito.bulkCreate(
        items.map((item) => ({ ...item, idUsuario })),
        { transaction },
      );
    }

    return {
      importado: items.length > 0,
      items: presentarItems(await obtenerFilasCarrito(idUsuario, transaction)),
    };
  });
};

export {
  obtenerCarritoPropio,
  agregarAlCarritoPropio,
  actualizarCantidadCarritoPropio,
  quitarDelCarritoPropio,
  vaciarCarritoPropio,
  vaciarCarritoEnTransaccion,
  importarSiEstaVacio,
};
