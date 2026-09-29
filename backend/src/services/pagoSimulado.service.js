import AppError from '../errors/AppError.js';

// Pago simulado (CU-04, §5): NO hay pasarela real, QR ni transferencia
// efectiva — todo lo que sigue es una simulación local y determinista.
//
// Transferencia: siempre se considera aprobada (no requiere datos de
// tarjeta). Débito: aprobación/rechazo determinista según el número de
// tarjeta de DEMOSTRACIÓN usado (ver TARJETAS_DEBITO_SIMULADAS abajo) — un
// número que no está en esta lista se rechaza, aunque tenga un formato
// válido. Estos números también se listan en
// frontend/src/utils/tarjetasSimuladas.js para mostrarlos en la interfaz
// ("datos ficticios que se pueden usar"); si se cambian acá hay que
// actualizar esa copia también (no se comparte código entre frontend y
// backend).
const TARJETAS_DEBITO_SIMULADAS = new Map([
  ['4000000000000002', { estado: 'aprobado_simulado' }],
  [
    '4000000000000010',
    { estado: 'rechazado_simulado', motivoRechazo: 'Pago rechazado por el banco (simulado)' },
  ],
  [
    '4000000000000028',
    { estado: 'rechazado_simulado', motivoRechazo: 'Fondos insuficientes (simulado)' },
  ],
]);

const PATRON_NUMERO = /^\d{16}$/;
const PATRON_VENCIMIENTO = /^(0[1-9]|1[0-2])\/(\d{2})$/;
const PATRON_CODIGO_SEGURIDAD = /^\d{3,4}$/;

// Valida forma y vigencia de los datos de la tarjeta, SIN mirar todavía si
// el número está en la lista de demostración. Nunca deja pasar el número ni
// el código de seguridad completos más allá de esta función: lo único que
// devuelve son los últimos 4 dígitos (para mostrar en el comprobante) y el
// número completo normalizado, que pagoSimulado.service.js usa una sola vez
// para la búsqueda en el Map de arriba y después descarta.
const validarYNormalizarTarjeta = (datosDebito) => {
  if (typeof datosDebito !== 'object' || datosDebito === null) {
    throw new AppError('Los datos de la tarjeta de débito son obligatorios', 400);
  }

  const numero = typeof datosDebito.numero === 'string' ? datosDebito.numero.replace(/\s+/g, '') : '';
  if (!PATRON_NUMERO.test(numero)) {
    throw new AppError('El número de tarjeta debe tener 16 dígitos', 400);
  }

  const titular = typeof datosDebito.titular === 'string' ? datosDebito.titular.trim() : '';
  if (titular.length < 2 || titular.length > 60) {
    throw new AppError('El nombre del titular no es válido', 400);
  }

  const vencimiento = typeof datosDebito.vencimiento === 'string' ? datosDebito.vencimiento.trim() : '';
  const coincidencia = PATRON_VENCIMIENTO.exec(vencimiento);
  if (!coincidencia) {
    throw new AppError('El vencimiento debe tener el formato MM/AA', 400);
  }

  const mes = Number(coincidencia[1]);
  const anio = 2000 + Number(coincidencia[2]);
  // Vencida si el mes/año indicado ya pasó respecto del mes actual (una
  // tarjeta vence al FINAL de su mes, no al principio).
  const finDeVencimiento = new Date(Date.UTC(anio, mes, 1));
  if (finDeVencimiento.getTime() <= Date.now()) {
    throw new AppError('La tarjeta está vencida', 400);
  }

  const codigoSeguridad = typeof datosDebito.codigoSeguridad === 'string' ? datosDebito.codigoSeguridad.trim() : '';
  if (!PATRON_CODIGO_SEGURIDAD.test(codigoSeguridad)) {
    throw new AppError('El código de seguridad debe tener 3 o 4 dígitos', 400);
  }

  return {
    numero,
    ultimosCuatroDigitos: numero.slice(-4),
  };
};

// Procesa un pago simulado. Devuelve, SIEMPRE (nunca lanza por un rechazo:
// un rechazo es un resultado válido, no una excepción — solo un dato de
// entrada mal formado lanza AppError 400):
//   { estado, tipo, ultimosCuatroDigitos, marca, motivoRechazo? }
const procesarPagoSimulado = ({ tipo, datosDebito }) => {
  if (tipo === 'transferencia') {
    return {
      estado: 'aprobado_simulado',
      tipo: 'transferencia',
      ultimosCuatroDigitos: null,
      marca: null,
    };
  }

  if (tipo === 'debito') {
    const { numero, ultimosCuatroDigitos } = validarYNormalizarTarjeta(datosDebito);

    const resultado = TARJETAS_DEBITO_SIMULADAS.get(numero) || {
      estado: 'rechazado_simulado',
      motivoRechazo: 'Tarjeta no reconocida para esta simulación',
    };

    return {
      ...resultado,
      tipo: 'debito',
      ultimosCuatroDigitos,
      marca: 'Débito simulado',
    };
  }

  throw new AppError('El tipo de pago simulado debe ser "transferencia" o "debito"', 400);
};

export default procesarPagoSimulado;
export { TARJETAS_DEBITO_SIMULADAS };
