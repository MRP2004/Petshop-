import { Router } from 'express';
import {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/cliente.controller.js';
import {
  requiereAutenticacion,
  requiereRol,
  permitirPropioClienteOStaff,
} from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];
// Un cliente puede ver/editar su propio registro; el personal, cualquiera.
const propioOPersonal = [requiereAutenticacion, permitirPropioClienteOStaff];

// El listado completo de clientes es información de gestión, no de
// autoservicio: solo personal. El alta pública de un cliente ocurre vía
// POST /api/usuarios/registro (crea Cliente + Usuario juntos), no acá.
router.get('/', ...soloPersonal, listar);
router.get('/:id', ...propioOPersonal, buscarPorId);
router.post('/', ...soloPersonal, crear);
router.put('/:id', ...propioOPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
