import { Router } from 'express';
import {
  listar,
  buscarPorId,
  registrar,
  cancelar,
  marcarComoEnviada,
} from '../controllers/venta.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// Todas las rutas de venta requieren sesión: un cliente ve/gestiona las
// suyas, el personal ve/gestiona cualquiera (la distinción exacta ocurre en
// venta.service.js, comparando contra req.usuario). No hay compra ni
// consulta de ventas sin haber iniciado sesión.
router.get('/', requiereAutenticacion, listar);
router.get('/:id', requiereAutenticacion, buscarPorId);
router.post('/', requiereAutenticacion, registrar);
router.patch('/:id/cancelar', requiereAutenticacion, cancelar);
// Marcar como enviada es una operación operativa interna, no algo que un
// cliente hace sobre su propia compra.
router.patch(
  '/:id/enviar',
  requiereAutenticacion,
  requiereRol('vendedor', 'administrador'),
  marcarComoEnviada,
);

export default router;
