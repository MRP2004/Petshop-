import { solicitar } from './httpClient.js';

// Favoritos propios (ronda 2): siempre "los del cliente de la sesión", nunca
// por id — ver favorito.routes.js/favorito.controller.js.
const listar = () => solicitar('/favoritos');
const agregar = (idProducto) => solicitar('/favoritos', { metodo: 'POST', cuerpo: { idProducto } });
const quitar = (idProducto) => solicitar(`/favoritos/${idProducto}`, { metodo: 'DELETE' });

export default { listar, agregar, quitar };
