import { solicitar } from './httpClient.js';

// Avisos propios (ronda 2, Etapa 6): siempre "los del usuario de la
// sesión" — ver aviso.routes.js/aviso.controller.js.
const listar = () => solicitar('/avisos');
const marcarLeido = (idAviso) => solicitar(`/avisos/${idAviso}/leido`, { metodo: 'POST' });
const marcarTodosLeidos = () => solicitar('/avisos/leidos', { metodo: 'POST' });

export default { listar, marcarLeido, marcarTodosLeidos };
