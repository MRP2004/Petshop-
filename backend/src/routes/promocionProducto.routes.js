import { Router } from 'express';
import {
  listar,
  listarGestion,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/promocionProducto.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

// Público: si hay promociones vigentes, la tienda debe poder mostrarlas
// únicamente dentro de su período inclusivo de vigencia.
router.get('/', listar);
router.get('/gestion', ...soloPersonal, listarGestion);
router.get('/:id', buscarPorId);
router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
