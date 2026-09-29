import { Router } from 'express';
import { provincias, localidades } from '../controllers/georef.controller.js';

const router = Router();

// Público: mismo catálogo de referencia para cualquiera (registro sin
// sesión todavía, o completar la dirección ya logueado) — no hay nada
// sensible en una lista de provincias/localidades.
router.get('/provincias', provincias);
router.get('/localidades', localidades);

export default router;
