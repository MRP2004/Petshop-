import Favorito from '../models/favorito.model.js';
import Producto from '../models/producto.model.js';
import AppError from '../errors/AppError.js';
import { relaciones as relacionesProducto } from './producto.service.js';
import { MAXIMO_ENTERO_POSITIVO, validarEnteroEnRango } from '../utils/validacion.js';

const validarIdProducto = (idProducto) =>
  validarEnteroEnRango(idProducto, 1, MAXIMO_ENTERO_POSITIVO, 'El ID del producto no es válido');

// Favoritos persistentes por cuenta (ronda 2, ver docs/frontend-diseno.md):
// siempre "los propios" — `idCliente` viene de `req.usuario.idCliente`
// (la sesión), nunca de la URL ni del cuerpo, mismo criterio que
// direccionCliente.service.js para no depender de ocultar nada en el
// frontend (real impedimento del lado del servidor, no solo UI).
//
// Devuelve productos completos (mismo shape que el resto del catálogo,
// ver producto.service.js#relaciones), no solo los ids: así el frontend
// puede reusar ProductCard.jsx tal cual para la lista de favoritos, sin
// otra consulta por producto.
const listarFavoritosPropios = async (idCliente) => {
  const favoritos = await Favorito.findAll({
    where: { idCliente },
    include: [{ model: Producto, as: 'producto', include: relacionesProducto }],
    order: [['creadoEn', 'DESC']],
  });

  return favoritos.map((favorito) => favorito.producto).filter(Boolean);
};

// Idempotente a propósito: agregar un producto ya favorito no es un error
// (el botón de "favorito" en la interfaz es un toggle, no un alta única) —
// simplemente confirma que ya está. El índice único de la base
// (idCliente+idProducto) es la protección real contra duplicados frente a
// dos pedidos concurrentes; este findOrCreate solo evita un 500 innecesario
// en el caso normal (no concurrente) de "ya es favorito".
const agregarFavorito = async (idCliente, idProductoCrudo) => {
  const idProducto = validarIdProducto(idProductoCrudo);

  const producto = await Producto.findByPk(idProducto);
  if (!producto) {
    throw new AppError('El producto indicado no existe', 400);
  }

  await Favorito.findOrCreate({
    where: { idCliente, idProducto },
    defaults: { idCliente, idProducto },
  });
};

// También idempotente: quitar un favorito que ya no estaba no es un error
// (mismo criterio que agregar) — el estado final que le importa a quien
// usa el toggle ("no está en mis favoritos") ya se cumple de cualquier
// forma.
const quitarFavorito = async (idCliente, idProductoCrudo) => {
  const idProducto = validarIdProducto(idProductoCrudo);
  await Favorito.destroy({ where: { idCliente, idProducto } });
};

export { listarFavoritosPropios, agregarFavorito, quitarFavorito };
