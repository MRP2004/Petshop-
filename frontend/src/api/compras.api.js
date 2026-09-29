import { solicitar } from './httpClient.js';

// Checkout con pago simulado (CU-04): exclusivo de un cliente autenticado.
// La carga manual de personal sigue usando ventas.api.js#registrar, sin
// cambios.
const cotizar = (detalles) =>
  solicitar('/compras/cotizacion', { metodo: 'POST', cuerpo: { detalles } });

const confirmar = (datos) => solicitar('/compras', { metodo: 'POST', cuerpo: datos });

// Recuperación tras perder la respuesta (CU-04, §1): consulta de solo
// lectura del resultado de un intento propio — ver
// backend/src/services/compra.service.js#consultarIntento.
const consultarIntento = (clave) =>
  solicitar(`/compras/intentos/${encodeURIComponent(clave)}`, { metodo: 'GET' });

export default { cotizar, confirmar, consultarIntento };
