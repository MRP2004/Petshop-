// Formato de fecha/hora/importe para comprobante y correo (CU-04, ronda de
// correcciones): un único módulo para que el PDF y el texto del correo usen
// exactamente las mismas reglas de presentación (la pantalla, en el
// frontend, usa su propia copia equivalente — frontend/src/utils/formato.js
// — porque backend y frontend son paquetes npm separados sin código común,
// mismo criterio ya usado para TARJETAS_DEBITO_SIMULADAS).
//
// timeZone y hour12 explícitos en los dos formateadores: no depender de la
// configuración regional del proceso que corre el servidor, ni mezclar
// formato de 12 y 24 horas entre distintas superficies (ver database.js
// para la otra mitad de esta corrección, sobre cómo se guarda/relee la
// fecha en la base).
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

const formateadorImporte = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
});

const formateadorFechaHora = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
  timeZone: ZONA_HORARIA,
});

// Acepta pesos (string/number, como se persiste en las columnas DECIMAL) o
// centavos enteros, según `enCentavos`.
const formatearImporte = (valor, { enCentavos = false } = {}) => {
  const pesos = enCentavos ? Number(valor) / 100 : Number(valor);
  return formateadorImporte.format(pesos);
};

const formatearFechaHora = (fecha) => formateadorFechaHora.format(new Date(fecha));

export { formatearImporte, formatearFechaHora, ZONA_HORARIA };
