import { Router } from 'express';
import {
  listar,
  agregar,
  actualizarCantidad,
  quitar,
  vaciar,
  importar,
} from '../controllers/carrito.controller.js';
import { requiereAutenticacion } from '../middlewares/autenticacion.middleware.js';

const router = Router();

router.use(requiereAutenticacion);
router.get('/', listar);
router.put('/importar', importar);
router.post('/items', agregar);
router.put('/items/:idProducto', actualizarCantidad);
router.delete('/items/:idProducto', quitar);
router.delete('/', vaciar);

export default router;
