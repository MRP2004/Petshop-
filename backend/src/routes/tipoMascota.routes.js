import { Router } from 'express';
import {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/tipoMascota.controller.js';

const router = Router();

router.get('/', listar);
router.get('/:id', obtenerPorId);
router.post('/', crear);
router.put('/:id', actualizar);
router.delete('/:id', eliminar);

export default router;