// Datos de DEMOSTRACIÓN para el débito simulado del checkout (CU-04). Deben
// coincidir exactamente con backend/src/services/pagoSimulado.service.js
// (TARJETAS_DEBITO_SIMULADAS) — no hay forma de compartir código entre
// frontend y backend en este proyecto, así que si se cambian ahí hay que
// actualizar esta copia también. Ninguna es una tarjeta real; no hay
// pasarela de pago detrás.
const TARJETAS_DEBITO_SIMULADAS = [
  { numero: '4000000000000002', resultado: 'Aprobada' },
  { numero: '4000000000000010', resultado: 'Rechazada (banco, simulado)' },
  { numero: '4000000000000028', resultado: 'Rechazada (fondos insuficientes, simulado)' },
];

export { TARJETAS_DEBITO_SIMULADAS };
