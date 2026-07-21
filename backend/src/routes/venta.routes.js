import { Router } from 'express';
import {
  listar,
  buscarPorId,
  registrar,
  cancelar,
  marcarComoEnviada,
} from '../controllers/venta.controller.js';

const router = Router();

router.get('/', listar);
router.get('/:id', buscarPorId);
router.post('/', registrar);
router.patch('/:id/cancelar', cancelar);
router.patch('/:id/enviar', marcarComoEnviada);

export default router;