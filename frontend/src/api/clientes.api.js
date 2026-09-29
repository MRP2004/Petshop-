import { solicitar } from './httpClient.js';
import crearServicioCrud from './crudGenerico.js';

const base = crearServicioCrud('/clientes');

// Dirección propia (ronda 2): siempre "la del cliente de la sesión", nunca
// por id — ver cliente.routes.js/direccionCliente.controller.js.
const obtenerDireccion = () => solicitar('/clientes/direccion');
const guardarDireccion = (datos) => solicitar('/clientes/direccion', { metodo: 'PUT', cuerpo: datos });

export default { ...base, obtenerDireccion, guardarDireccion };
