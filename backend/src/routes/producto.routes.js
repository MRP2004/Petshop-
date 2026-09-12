import { Router } from 'express';
import {
  listar,
  listarStockBajo,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
  ajustarStock,
} from '../controllers/producto.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];

// Catálogo de lectura: público, como en cualquier tienda (Chewy incluido) se
// puede navegar sin haber iniciado sesión.
router.get('/', listar);
// Antes de '/:id' a propósito: si no, Express interpretaría "stock-bajo"
// como un :id y nunca llegaría a esta ruta.
router.get('/stock-bajo', ...soloPersonal, listarStockBajo);
router.get('/:id', buscarPorId);

router.post('/', ...soloPersonal, crear);
router.put('/:id', ...soloPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);
// Único endpoint habilitado para modificar el stock de un producto existente
// (el PUT general lo rechaza explícitamente). Ver docs/backend-api.md.
router.patch('/:id/stock', ...soloPersonal, ajustarStock);

export default router;
