import { Router } from 'express';
import {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/proveedor.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// Información interna del negocio (a diferencia de categorías/tipos de
// mascota, que son de navegación pública): solo personal.
const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

router.get('/', ...soloPersonal, listar);
router.get('/:id', ...soloPersonal, buscarPorId);
router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
