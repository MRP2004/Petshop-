// Traducción de estados internos a etiquetas legibles (CU-04, ronda de
// correcciones): copia equivalente de backend/src/utils/estadosLegibles.js
// — frontend y backend son paquetes separados sin código común (mismo
// criterio que TARJETAS_DEBITO_SIMULADAS), así que se mantiene la misma
// lista de etiquetas en los dos lugares.
const ESTADOS_PAGO = {
  aprobado_simulado: 'Aprobado — simulación',
  rechazado_simulado: 'Rechazado — simulación',
  revertido_simulado: 'Revertido — simulación',
};

// Ronda 2, Etapa 7: mismos 2 valores nuevos que backend/src/utils/estadosLegibles.js.
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
  no_configurado: 'No configurado en este entorno',
  aceptado: 'Aceptado por el servidor de correo',
  fallido: 'No se pudo enviar',
  no_aplica: 'No aplica (sin correo cargado)',
};

const etiquetaEstadoPago = (estado) => ESTADOS_PAGO[estado] || estado;
const etiquetaEstadoVenta = (estado) => ESTADOS_VENTA[estado] || estado;
const etiquetaEstadoCorreo = (estado) => ESTADOS_CORREO[estado] || estado;

export { etiquetaEstadoPago, etiquetaEstadoVenta, etiquetaEstadoCorreo };
