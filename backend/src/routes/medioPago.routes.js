import { Router } from 'express';
import {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/medioPago.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

// Público: el checkout necesita mostrar las opciones de medio de pago antes
// de que el cliente confirme la compra.
router.get('/', listar);
router.get('/:id', buscarPorId);

router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
