// Traducción de estados internos a etiquetas legibles para personas
// (CU-04, ronda de correcciones): los valores de ENUM (pago.estado,
// venta.estado, comprobante.estadoCorreo) se conservan tal cual para la
// lógica (comparaciones, transiciones); esto es solo para lo que ve un
// humano en el PDF, el correo o la pantalla. Un estado sin traducción
// conocida se muestra tal cual (nunca se oculta ni se rompe el render por
// un valor inesperado).
const ESTADOS_PAGO = {
  aprobado_simulado: 'Aprobado — simulación',
  rechazado_simulado: 'Rechazado — simulación',
  revertido_simulado: 'Revertido — simulación',
};

const ESTADOS_VENTA = {
  registrada: 'Registrada',
  enviada: 'Enviada',
  lista_para_retirar: 'Lista para retirar',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
};

const ESTADOS_CORREO = {
  pendiente: 'Pendiente de envío',
  simulado: 'Simulado (modo de prueba, sin envío real)',
  no_configurado: 'No configurado (el servicio de correo no está habilitado en este entorno)',
  aceptado: 'Aceptado por el servidor de correo (no garantiza que llegó a la casilla)',
  fallido: 'No se pudo enviar (o no se pudo confirmar el envío)',
  no_aplica: 'No aplica (sin correo electrónico registrado)',
};

const etiquetaEstadoPago = (estado) => ESTADOS_PAGO[estado] || estado;
const etiquetaEstadoVenta = (estado) => ESTADOS_VENTA[estado] || estado;
const etiquetaEstadoCorreo = (estado) => ESTADOS_CORREO[estado] || estado;

export { etiquetaEstadoPago, etiquetaEstadoVenta, etiquetaEstadoCorreo };
