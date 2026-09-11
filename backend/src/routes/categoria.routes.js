import { Router } from 'express';
import {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/categoria.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

// Público: la navegación por categoría (catálogo) la necesita cualquier
// visitante, no solo usuarios autenticados.
router.get('/', listar);
router.get('/:id', buscarPorId);

router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
