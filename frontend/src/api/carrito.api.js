import { solicitar } from './httpClient.js';

const listar = () => solicitar('/carrito');

const agregar = (idProducto, cantidad) =>
  solicitar('/carrito/items', {
    metodo: 'POST',
    cuerpo: { idProducto, cantidad },
  });

const actualizarCantidad = (idProducto, cantidad) =>
  solicitar(`/carrito/items/${idProducto}`, {
    metodo: 'PUT',
    cuerpo: { cantidad },
  });

const quitar = (idProducto) =>
  solicitar(`/carrito/items/${idProducto}`, { metodo: 'DELETE' });

const vaciar = () => solicitar('/carrito', { metodo: 'DELETE' });

const importar = (items) =>
  solicitar('/carrito/importar', {
    metodo: 'PUT',
    cuerpo: { items },
  });

export default {
  listar,
  agregar,
  actualizarCantidad,
  quitar,
  vaciar,
  importar,
};
