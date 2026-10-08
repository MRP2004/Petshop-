import { Router } from 'express';
import {
  listar,
  listarJerarquia,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/tipoMascota.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

// Público: la navegación por tipo de mascota (catálogo) la necesita
// cualquier visitante, no solo usuarios autenticados.
router.get('/', listar);
router.get('/jerarquia', listarJerarquia);
router.get('/:id', obtenerPorId);

router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
