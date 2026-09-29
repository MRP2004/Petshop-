import { solicitar, solicitarBinario } from './httpClient.js';

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

const marcarComoEntregada = (id) => solicitar(`/ventas/${id}/entregar`, { metodo: 'PATCH' });

// Comprobante (CU-04): PDF descargable y reenvío de correo, protegidos por
// la misma regla "propia o personal" que ver la venta (backend).
const descargarComprobantePdf = (id) => solicitarBinario(`/ventas/${id}/comprobante/pdf`);

const reenviarCorreoComprobante = (id) =>
  solicitar(`/ventas/${id}/comprobante/reenviar-correo`, { metodo: 'POST' });

export default {
  listar,
  obtener,
  registrar,
  cancelar,
  marcarComoEnviada,
  marcarComoEntregada,
  descargarComprobantePdf,
  reenviarCorreoComprobante,
};
