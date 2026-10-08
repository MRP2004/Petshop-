import { cotizar, aRespuestaPublica } from '../services/cotizacion.service.js';
import { confirmarCompra, consultarIntento } from '../services/compra.service.js';

const obtenerCotizacion = async (req, res, next) => {
  try {
    const cotizacion = await cotizar(req.body.detalles);
    res.status(200).json(aRespuestaPublica(cotizacion));
  } catch (error) {
    next(error);
  }
};

const confirmar = async (req, res, next) => {
  try {
    const resultado = await confirmarCompra(req.body, req.usuario);

    if (resultado.tipo === 'rechazado') {
      // 402 (Payment Required) identifica sin ambigüedad "el pago se
      // procesó pero fue rechazado" — distinto de un 400 (solicitud mal
      // formada) o un 409 (conflicto de idempotencia/cotización): el
      // frontend usa este código para mostrar el motivo y ofrecer
      // reintentar con otra tarjeta.
      return res.status(402).json({
        estado: 'rechazado_simulado',
        motivoRechazo: resultado.motivoRechazo,
      });
    }

    res.status(201).json(resultado.venta);
  } catch (error) {
    // La cotización desactualizada (409) lleva la cotización vigente en el
    // cuerpo del error, para que el frontend la muestre sin otra ida y
    // vuelta (ver compra.service.js#confirmarCompra).
    if (error.codigo === 'COTIZACION_DESACTUALIZADA') {
      return res.status(409).json({
        error: error.message,
        codigo: error.codigo,
        cotizacionVigente: error.cotizacionVigente,
      });
    }
    next(error);
  }
};

// Recuperación tras perder la respuesta (CU-04, §1): consulta de solo
// lectura, nunca sustituye el camino atómico de `confirmar` — ver
// compra.service.js#consultarIntento.
const consultarIntentoPorClave = async (req, res, next) => {
  try {
    const resultado = await consultarIntento(req.params.clave, req.usuario);
    res.status(200).json(resultado);
  } catch (error) {
    next(error);
  }
};

export { obtenerCotizacion, confirmar, consultarIntentoPorClave };
