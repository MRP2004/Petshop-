import { Router } from 'express';
import { obtenerCotizacion, confirmar, consultarIntentoPorClave } from '../controllers/compra.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// Checkout con pago simulado (CU-04): exclusivo de cuentas compradoras
// ('cliente' y, desde la Etapa 8, 'vendedor_independiente' — sigue siendo
// comprador además de vendedor, ver usuario.model.js). La carga manual de
// ventas por el personal sigue siendo /api/ventas (POST), sin cambios —
// este es un flujo aparte, no un reemplazo.
const ROLES_COMPRADOR = ['cliente', 'vendedor_independiente'];

router.post('/cotizacion', requiereAutenticacion, requiereRol(...ROLES_COMPRADOR), obtenerCotizacion);
router.post('/', requiereAutenticacion, requiereRol(...ROLES_COMPRADOR), confirmar);
// Recuperación tras perder la respuesta (CU-04, §1, ronda de correcciones):
// consulta de solo lectura del resultado de un intento propio por su clave
// de idempotencia — ver compra.service.js#consultarIntento.
router.get('/intentos/:clave', requiereAutenticacion, requiereRol(...ROLES_COMPRADOR), consultarIntentoPorClave);

export default router;
