import DireccionCliente from '../models/direccionCliente.model.js';
import AppError from '../errors/AppError.js';
import { esProvinciaValida, obtenerNombreProvincia, buscarLocalidadEnProvincia } from './georef.service.js';
import { esObjetoPlano, limpiarCadenaOpcional } from '../utils/validacion.js';

const LONGITUD_MAXIMA_CALLE = 120;
const LONGITUD_MAXIMA_NUMERO = 20;
const LONGITUD_MAXIMA_PISO = 20;
const LONGITUD_MAXIMA_INDICACIONES = 200;

const prepararDatosDireccion = async (datos) => {
  if (!esObjetoPlano(datos)) {
    throw new AppError('El cuerpo de la dirección no es válido', 400);
  }

  const idProvincia = typeof datos.idProvincia === 'string' ? datos.idProvincia.trim() : '';

  if (!esProvinciaValida(idProvincia)) {
    throw new AppError('La provincia indicada no existe', 400);
  }

  const idLocalidad = typeof datos.idLocalidad === 'string' ? datos.idLocalidad.trim() : '';

  if (!idLocalidad) {
    throw new AppError('La localidad es obligatoria', 400);
  }

  // Coherencia provincia-localidad contra el catálogo real (cacheado), no
  // solo por nombre — pedido explícito de esta ronda. Si Georef está caído
  // y no hay nada cacheado todavía para esta provincia, esto propaga el
  // 503 de georef.service.js tal cual (no se puede validar sin el
  // catálogo real).
  const localidadEncontrada = await buscarLocalidadEnProvincia(idLocalidad, idProvincia);

  if (!localidadEncontrada) {
    throw new AppError('La localidad indicada no pertenece a la provincia elegida', 400);
  }

  const calle = typeof datos.calle === 'string' ? datos.calle.trim() : '';

  if (!calle) {
    throw new AppError('La calle es obligatoria', 400);
  }

  if (calle.length > LONGITUD_MAXIMA_CALLE) {
    throw new AppError(`La calle no puede superar los ${LONGITUD_MAXIMA_CALLE} caracteres`, 400);
  }

  const numero = typeof datos.numero === 'string' ? datos.numero.trim() : '';

  if (!numero) {
    throw new AppError('El número es obligatorio', 400);
  }

  if (numero.length > LONGITUD_MAXIMA_NUMERO) {
    throw new AppError(`El número no puede superar los ${LONGITUD_MAXIMA_NUMERO} caracteres`, 400);
  }

  const piso = limpiarCadenaOpcional(datos.piso, 'El piso');

  if (piso && piso.length > LONGITUD_MAXIMA_PISO) {
    throw new AppError(`El piso no puede superar los ${LONGITUD_MAXIMA_PISO} caracteres`, 400);
  }

  const indicaciones = limpiarCadenaOpcional(datos.indicaciones, 'Las indicaciones');

  if (indicaciones && indicaciones.length > LONGITUD_MAXIMA_INDICACIONES) {
    throw new AppError(
      `Las indicaciones no pueden superar los ${LONGITUD_MAXIMA_INDICACIONES} caracteres`,
      400,
    );
  }

  return {
    idProvincia,
    // nombre legible tomado del propio catálogo (Georef/JSON estático), no
    // de lo que mande el cliente: así queda siempre consistente con el id.
    provincia: obtenerNombreProvincia(idProvincia),
    idLocalidad,
    localidad: localidadEncontrada.nombre,
    calle,
    numero,
    piso,
    indicaciones,
  };
};

// null si el cliente todavía no guardó ninguna dirección — no es un error,
// es un estado válido (pedido explícito: "los clientes existentes deben
// conservar sus datos y poder completar la dirección posteriormente").
const obtenerDireccionPropia = (idCliente) => DireccionCliente.findByPk(idCliente);

const guardarDireccionPropia = async (idCliente, datos) => {
  const datosPreparados = await prepararDatosDireccion(datos);

  await DireccionCliente.upsert({ idCliente, ...datosPreparados });

  // Re-lee en vez de confiar en el valor de retorno de upsert() (en MySQL
  // no siempre viene poblado de forma confiable) — mismo criterio que
  // producto.service.js#obtenerProductoPorId tras crear/actualizar.
  return DireccionCliente.findByPk(idCliente);
};

export { obtenerDireccionPropia, guardarDireccionPropia, prepararDatosDireccion };
