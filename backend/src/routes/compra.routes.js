import { Router } from 'express';

import {
  obtenerCotizacion,
  confirmar,
  consultarIntentoPorClave,
  iniciarMercadoPago,
  recibirWebhookMercadoPago,
} from '../controllers/compra.controller.js';

import {
  requiereAutenticacion,
  requiereRol,
} from '../middlewares/autenticacion.middleware.js';

const router = Router();

const ROLES_COMPRADOR = ['cliente', 'vendedor_independiente'];

// Cotización y checkout simulado.
router.post(
  '/cotizacion',
  requiereAutenticacion,
  requiereRol(...ROLES_COMPRADOR),
  obtenerCotizacion,
);

router.post(
  '/',
  requiereAutenticacion,
  requiereRol(...ROLES_COMPRADOR),
  confirmar,
);

// Recuperación de intentos de compra.
router.get(
  '/intentos/:clave',
  requiereAutenticacion,
  requiereRol(...ROLES_COMPRADOR),
  consultarIntentoPorClave,
);

// Inicio de Checkout Pro.
router.post(
  '/mercado-pago',
  requiereAutenticacion,
  requiereRol(...ROLES_COMPRADOR),
  iniciarMercadoPago,
);

// Notificaciones de Mercado Pago.
// No requiere sesión: la autenticidad se verifica con la firma del webhook.
router.post(
  '/mercado-pago/webhook',
  recibirWebhookMercadoPago,
);

export default router;