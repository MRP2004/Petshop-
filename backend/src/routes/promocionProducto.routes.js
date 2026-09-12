import { Router } from 'express';
import {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/promocionProducto.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

// Público: si hay promociones vigentes, la tienda debe poder mostrarlas
// (ver docs/estado-proyecto.md: no se muestran como aplicadas/calculadas en
// el precio todavía, solo listadas).
router.get('/', listar);
router.get('/:id', buscarPorId);

router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
