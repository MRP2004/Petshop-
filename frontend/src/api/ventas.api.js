import { solicitar } from './httpClient.js';

// No usa crearServicioCrud: Venta no tiene PUT/DELETE (se registra o se
// cancela, nunca se edita ni se borra), y agrega acciones propias
// (cancelar, marcar enviada) y filtros exclusivos de personal.
const listar = ({ idCliente, idProveedor } = {}) => {
  const parametros = new URLSearchParams();
  if (idCliente) parametros.set('idCliente', idCliente);
  if (idProveedor) parametros.set('idProveedor', idProveedor);
  const query = parametros.toString();
  return solicitar(`/ventas${query ? `?${query}` : ''}`);
};

const obtener = (id) => solicitar(`/ventas/${id}`);

// idCliente solo lo usa el personal (venta manual para un cliente elegido);
// en la compra de un cliente autenticado el backend lo ignora y usa el de la
// sesión, así que ni hace falta mandarlo.
const registrar = (datos) => solicitar('/ventas', { metodo: 'POST', cuerpo: datos });

const cancelar = (id) => solicitar(`/ventas/${id}/cancelar`, { metodo: 'PATCH' });

const marcarComoEnviada = (id) => solicitar(`/ventas/${id}/enviar`, { metodo: 'PATCH' });

export default { listar, obtener, registrar, cancelar, marcarComoEnviada };
